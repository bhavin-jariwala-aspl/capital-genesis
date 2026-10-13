'use strict';

jest.mock('@prisma/client');

const IntegrationService = require('../src/services/integration.service');

// ── OutboundWebhookConnector (accessed via IntegrationService.executeIntegration) ──

function makePrisma(integrationOverride = {}) {
  const integration = {
    id:        1,
    name:      'test-hook',
    label:     'Test Hook',
    type:      'outbound_webhook',
    is_active: true,
    config:    { url: 'http://example.com/hook', method: 'POST', timeout_ms: 5000 },
    ...integrationOverride,
  };
  return {
    integration: {
      findUnique: jest.fn().mockResolvedValue(integration),
      update:     jest.fn().mockResolvedValue(integration),
      findMany:   jest.fn().mockResolvedValue([integration]),
    },
    integrationLog: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
    // $transaction is called with an array of promises in executeIntegration/receiveInbound.
    $transaction: jest.fn().mockImplementation(ops => Promise.all(ops)),
  };
}

// ── CRUD ────────────────────────────────────────────────────────────────────

describe('IntegrationService CRUD', () => {
  it('listIntegrations calls findMany', async () => {
    const prisma = makePrisma();
    const svc    = new IntegrationService(prisma);
    await svc.listIntegrations();
    expect(prisma.integration.findMany).toHaveBeenCalled();
  });

  it('createIntegration rejects invalid type', async () => {
    const prisma = makePrisma();
    prisma.integration.create = jest.fn();
    const svc = new IntegrationService(prisma);
    await expect(svc.createIntegration({ name: 'x', label: 'x', type: 'bad_type' }))
      .rejects.toThrow('Invalid integration type');
  });
});

// ── OutboundWebhookConnector ─────────────────────────────────────────────────

describe('OutboundWebhookConnector.execute', () => {
  // We test the connector indirectly via executeIntegration with a mocked
  // HTTP layer (node:http is mocked so no real network is required).

  it('throws when config.url is missing', async () => {
    const prisma = makePrisma({ config: {} }); // no url
    const svc    = new IntegrationService(prisma);
    await expect(svc.executeIntegration(1, { foo: 'bar' }))
      .rejects.toThrow('config.url is required');
    // Failure is logged
    expect(prisma.integrationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'error' }),
    }));
  });

  it('logs error and rethrows on connector failure', async () => {
    const prisma = makePrisma({ config: { url: 'http://nowhere.invalid/hook', retry: { attempts: 1 } } });
    const svc    = new IntegrationService(prisma);
    await expect(svc.executeIntegration(1, {})).rejects.toThrow();
    expect(prisma.integrationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'error', error: expect.any(String) }),
    }));
  });

  it('rejects when integration is inactive', async () => {
    const prisma = makePrisma({ is_active: false });
    const svc    = new IntegrationService(prisma);
    await expect(svc.executeIntegration(1, {})).rejects.toThrow('is not active');
  });

  it('rejects for a type with no registered connector', async () => {
    // email_sync is planned but not implemented → no ConnectorClass in the registry.
    const prisma = makePrisma({ type: 'email_sync' });
    const svc    = new IntegrationService(prisma);
    await expect(svc.executeIntegration(1, {})).rejects.toThrow('No connector for type');
  });
});

// ── Timeout config propagation ───────────────────────────────────────────────
// Verify that the timeout_ms value from config is correctly wired through
// to the HTTP request (previously broken — config was out of scope in #httpRequest)

describe('OutboundWebhookConnector timeout_ms scoping', () => {
  it('uses config.timeout_ms and does not throw a ReferenceError for config', async () => {
    // Import the connector class directly to unit-test the scoping fix
    // We can't import the private class directly, so we verify via duck-typing:
    // instantiate through the service, capture the http.request call.
    const http = require('node:http');
    const mockReq = {
      setTimeout: jest.fn(),
      on:         jest.fn(),
      write:      jest.fn(),
      end:        jest.fn(),
    };
    jest.spyOn(http, 'request').mockImplementation((_opts, cb) => {
      // Simulate an immediate valid response
      const res = {
        statusCode: 200,
        on: (event, handler) => {
          if (event === 'data') handler(Buffer.from('{"ok":true}'));
          if (event === 'end')  handler();
        },
      };
      cb(res);
      return mockReq;
    });

    // Use a public host so the SSRF guard allows the (mocked) request through.
    const prisma = makePrisma({ config: { url: 'http://hooks.example.com/hook', timeout_ms: 3000 } });
    const svc    = new IntegrationService(prisma);

    await expect(svc.executeIntegration(1, { test: true })).resolves.toBeDefined();

    // setTimeout must have been called with the config value (3000), not the default (10000)
    expect(mockReq.setTimeout).toHaveBeenCalledWith(3000, expect.any(Function));

    http.request.mockRestore();
  });

  it('defaults to 10000ms when timeout_ms is not in config', async () => {
    const http = require('node:http');
    const mockReq = {
      setTimeout: jest.fn(),
      on:         jest.fn(),
      write:      jest.fn(),
      end:        jest.fn(),
    };
    jest.spyOn(http, 'request').mockImplementation((_opts, cb) => {
      const res = {
        statusCode: 200,
        on: (event, handler) => {
          if (event === 'data') handler(Buffer.from('{}'));
          if (event === 'end')  handler();
        },
      };
      cb(res);
      return mockReq;
    });

    const prisma = makePrisma({ config: { url: 'http://hooks.example.com/hook' } }); // no timeout_ms
    const svc    = new IntegrationService(prisma);

    await expect(svc.executeIntegration(1, {})).resolves.toBeDefined();
    expect(mockReq.setTimeout).toHaveBeenCalledWith(10_000, expect.any(Function));

    http.request.mockRestore();
  });
});

// ── Security & delivery semantics (new event-driven hub behaviour) ───────────

function mockHttp(statusCode = 200, body = '{}') {
  const http = require('node:http');
  const mockReq = { setTimeout: jest.fn(), on: jest.fn(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };
  const capture = {};
  jest.spyOn(http, 'request').mockImplementation((opts, cb) => {
    capture.opts = opts;
    cb({
      statusCode,
      on: (event, handler) => {
        if (event === 'data') handler(Buffer.from(body));
        if (event === 'end')  handler();
      },
    });
    return mockReq;
  });
  return { http, capture };
}

describe('IntegrationService delivery semantics', () => {
  afterEach(() => { const http = require('node:http'); if (http.request.mockRestore) http.request.mockRestore(); });

  it('blocks SSRF to private/loopback hosts (never opens a socket)', async () => {
    const { capture } = mockHttp(200);
    const prisma = makePrisma({ config: { url: 'http://127.0.0.1/hook' } });
    const svc    = new IntegrationService(prisma);
    await expect(svc.executeIntegration(1, {})).rejects.toThrow(/SSRF|Blocked outbound/);
    expect(capture.opts).toBeUndefined(); // http.request never reached
    expect(prisma.integrationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'error' }),
    }));
  });

  it('treats a non-2xx response as a failed delivery', async () => {
    mockHttp(500, 'server error');
    const prisma = makePrisma({ config: { url: 'http://hooks.example.com/hook', retry: { attempts: 1 } } });
    const svc    = new IntegrationService(prisma);
    await expect(svc.executeIntegration(1, {})).rejects.toThrow(/HTTP 500/);
    expect(prisma.integrationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'error' }),
    }));
  });

  it('signs the payload with HMAC-SHA256 when a secret is configured', async () => {
    const crypto = require('node:crypto');
    const { capture } = mockHttp(200);
    const secret = 'top-secret';
    const prisma = makePrisma({ config: { url: 'http://hooks.example.com/hook', secret } });
    const svc    = new IntegrationService(prisma);

    const payload = { hello: 'world' };
    await svc.executeIntegration(1, payload);

    const sig = capture.opts.headers['X-Signature-256'];
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(JSON.stringify(payload), 'utf-8').digest('hex');
    expect(sig).toBe(expected);
  });

  it('isSafeUrl blocks encoded/mapped loopback bypasses', () => {
    // Regression guards for the hardened SSRF policy.
    expect(IntegrationService.isSafeUrl('http://[::ffff:127.0.0.1]/x')).toBe(false); // IPv4-mapped IPv6
    expect(IntegrationService.isSafeUrl('http://2130706433/x')).toBe(false);         // decimal 127.0.0.1
    expect(IntegrationService.isSafeUrl('http://0x7f000001/x')).toBe(false);         // hex 127.0.0.1
    expect(IntegrationService.isSafeUrl('http://0.0.0.0/x')).toBe(false);            // this-host
    expect(IntegrationService.isSafeUrl('http://[::1]/x')).toBe(false);              // IPv6 loopback
    expect(IntegrationService.isSafeUrl('https://api.hubspot.com/x')).toBe(true);    // public still allowed
  });

  it('dispatchEvent fans out only to active, subscribed, deliverable integrations', async () => {
    const integrations = [
      { id: 1, name: 'a', type: 'outbound_webhook', is_active: true, config: { events: ['record.created'] } },
      { id: 2, name: 'b', type: 'outbound_webhook', is_active: true, config: { events: ['record.updated'] } },
      { id: 3, name: 'c', type: 'inbound_webhook',  is_active: true, config: { events: ['record.created'] } },
    ];
    const prisma = { integration: { findMany: jest.fn().mockResolvedValue(integrations) } };
    const svc = new IntegrationService(prisma);
    const spy = jest.spyOn(svc, 'executeIntegration').mockResolvedValue({ id: 0 });

    await svc.dispatchEvent('record.created', { x: 1 }, { actorId: 7 });

    expect(spy).toHaveBeenCalledTimes(1);
    const [id, envelope] = spy.mock.calls[0];
    expect(id).toBe(1);
    expect(envelope).toMatchObject({ event: 'record.created', api_version: '2024-01', data: { x: 1 }, actor: { id: 7 } });
    expect(envelope.id).toBeDefined();
  });
});

// ── Metadata-driven per-object events, named connections, connectors ─────────

describe('IntegrationService cohesion features', () => {
  afterEach(() => { const http = require('node:http'); if (http.request.mockRestore) http.request.mockRestore(); });

  it('dispatchEvent matches per-object subscriptions (lead.created) via object metadata', async () => {
    const integrations = [
      { id: 1, name: 'lead-hook', type: 'outbound_webhook', is_active: true, config: { events: ['lead.created'] } },
      { id: 2, name: 'opp-hook',  type: 'outbound_webhook', is_active: true, config: { events: ['opportunity.created'] } },
      { id: 3, name: 'all-hook',  type: 'outbound_webhook', is_active: true, config: { events: ['record.created'] } },
    ];
    const prisma = {
      integration: { findMany: jest.fn().mockResolvedValue(integrations) },
      uiObject:    { findUnique: jest.fn().mockResolvedValue({ name: 'lead' }) },
    };
    const svc = new IntegrationService(prisma);
    const spy = jest.spyOn(svc, 'executeIntegration').mockResolvedValue({ id: 0 });

    // record.created for the "lead" object → lead-hook (per-object) + all-hook (generic), NOT opp-hook
    await svc.dispatchEvent('record.created', { x: 1 }, { objectId: 5 });

    const firedIds = spy.mock.calls.map(c => c[0]).sort();
    expect(firedIds).toEqual([1, 3]);
    expect(spy.mock.calls[0][1].object).toEqual({ id: 5, name: 'lead' });
  });

  it('executeByName runs a registered integration and force-bypasses the inactive toggle', async () => {
    const { capture } = mockHttp(200);
    const integration = { id: 9, name: 'crm-sync', type: 'outbound_webhook', is_active: false,
      config: { url: 'http://hooks.example.com/sync' } };
    const prisma = makePrisma();
    prisma.integration.findUnique = jest.fn().mockResolvedValue(integration);
    const svc = new IntegrationService(prisma);

    const log = await svc.executeByName('crm-sync', { hi: 1 }); // force defaults true
    expect(log).toBeDefined();
    expect(capture.opts.hostname).toBe('hooks.example.com');
    // Without force, the inactive integration is rejected:
    await expect(svc.executeByName('crm-sync', {}, { force: false })).rejects.toThrow(/not active/);
  });

  it('enrichment connector calls the provider and returns its data', async () => {
    const { capture } = mockHttp(200, '{"employees": 250, "industry": "SaaS"}');
    const prisma = makePrisma({ type: 'enrichment', config: { url: 'http://enrich.example.com/lookup' } });
    const svc = new IntegrationService(prisma);
    const log = await svc.executeIntegration(1, { email: 'a@b.com' });
    expect(log).toBeDefined();
    expect(capture.opts.hostname).toBe('enrich.example.com');
    expect(prisma.integrationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'success', response_body: { employees: 250, industry: 'SaaS' } }),
    }));
  });

  it('custom connector behaves like an outbound webhook (SSRF + delivery)', async () => {
    mockHttp(200);
    const prisma = makePrisma({ type: 'custom', config: { url: 'http://127.0.0.1/x' } });
    const svc = new IntegrationService(prisma);
    await expect(svc.executeIntegration(1, {})).rejects.toThrow(/SSRF|Blocked outbound/);
  });

  it('getEventCatalog is metadata-driven (generic + per-object events)', async () => {
    const prisma = {
      uiObject: { findMany: jest.fn().mockResolvedValue([
        { name: 'lead', label: 'Lead' },
        { name: 'opportunity', label: 'Opportunity' },
      ]) },
    };
    const svc = new IntegrationService(prisma);
    const cat = await svc.getEventCatalog();
    const events = cat.events.map(e => e.event);
    expect(events).toContain('record.created');   // generic
    expect(events).toContain('lead.created');       // per-object
    expect(events).toContain('opportunity.updated');
    expect(cat.objects).toEqual([{ name: 'lead', label: 'Lead' }, { name: 'opportunity', label: 'Opportunity' }]);
  });
});
