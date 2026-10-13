'use strict';

const crypto = require('crypto');

/**
 * Sandbox connectors for the systems a financial-services tenant integrates
 * with but which are not reachable from a demo or UAT environment: sanctions
 * screening, the credit bureau, the core loan system, the transfer agent, the
 * order management system, the FX dealing system and the SMS gateway.
 *
 * Each simulator answers through exactly the contract a live connector uses
 * (`{ status, response_body, duration_ms }`), so workflows — including their
 * `field_map` write-back — run end to end. Going live means changing the
 * integration's `type` to `outbound_webhook` / `enrichment` and pointing it at
 * the provider; no workflow changes.
 *
 * Responses are deterministic (derived from a hash of the request), so the
 * same input always yields the same reference, score or hit.
 */

const today = () => new Date().toISOString().slice(0, 10);
const digest = (...parts) => crypto.createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex');
const num = (hex, mod) => parseInt(hex.slice(0, 8), 16) % mod;
const ref = (prefix, hex, len = 6) => `${prefix}-${String(num(hex, 10 ** len)).padStart(len, '0')}`;

const HIGH_RISK_COUNTRIES = new Set(['IR', 'KP', 'MM']);

const PROVIDERS = {
  /** Sanctions / PEP / adverse-media screening (KYC-FR-03). */
  screening(p) {
    const name = String(p.name ?? '').trim();
    const h = digest('screen', name.toLowerCase(), p.date_of_birth, p.country);
    const reasons = [];
    if (p.pep === true || p.pep === 'true') reasons.push({ list_type: 'pep', score: 90 + num(h, 10) });
    if (HIGH_RISK_COUNTRIES.has(String(p.country ?? '').toUpperCase())) reasons.push({ list_type: 'sanctions', score: 85 + num(h, 15) });
    // A small, stable share of ordinary names produce a weak adverse-media hit
    // so the triage flow can be exercised.
    if (!reasons.length && num(h, 100) < 8) reasons.push({ list_type: 'adverse_media', score: 50 + num(h.slice(8), 20) });
    return {
      result: reasons.some((r) => r.score >= 85) ? 'potential_match' : (reasons.length ? 'potential_match' : 'clear'),
      reference: ref('SCR', h),
      screened_on: today(),
      hits: reasons.map((r, i) => ({ ...r, matched_name: name, source_reference: ref(`WC-${r.list_type.toUpperCase().slice(0, 3)}`, digest(h, i)) })),
      hit_count: reasons.length,
      top_list: reasons[0]?.list_type ?? null,
      top_score: reasons[0]?.score ?? null,
    };
  },

  /** Mauritius Credit Information Bureau report (LOAN-FR-06). */
  mcib(p) {
    const h = digest('mcib', p.id_number ?? p.party ?? p.name);
    const score = 520 + num(h, 330);
    return {
      report_reference: ref('MCIB', h, 8),
      score,
      rating: score >= 700 ? 'clean' : score >= 600 ? 'minor' : 'adverse',
      open_facilities: num(h.slice(8), 4),
      monthly_obligations: num(h.slice(16), 40) * 1000,
      pulled_on: today(),
    };
  },

  /** Core loan management system: book a disbursement (I-03). */
  lms(p) {
    const h = digest('lms', p.application_no ?? p.disbursement_no, p.amount);
    return { account_no: ref('LMS', h, 7), booking_reference: ref('BK', h), booked_on: today(), status: 'booked' };
  },

  /** Transfer agent: accept a subscription / redemption / switch (FND-FR-02). */
  ta(p) {
    const h = digest('ta', p.order_no, p.amount, p.order_type);
    return { ta_reference: ref('TA', h, 7), dealing_date: today(), status: 'confirmed' };
  },

  /** Order management system: hand off a client order (SEC-FR-03). */
  oms(p) {
    const h = digest('oms', p.order_ref, p.instrument, p.quantity);
    return { oms_reference: ref('OMS', h, 7), accepted_at: new Date().toISOString(), status: 'accepted' };
  },

  /** FX dealing system: book a deal (FX-FR-03). */
  fx_dealing(p) {
    const h = digest('fx', p.deal_no, p.currency_code, p.amount);
    return { dealing_reference: ref('KTP', h, 7), status: 'booked', booked_at: new Date().toISOString() };
  },

  /** SMS gateway (I-11). */
  sms(p) {
    const h = digest('sms', p.to, p.message, Date.now());
    return { message_id: ref('SMS', h, 9), status: 'queued', to: p.to };
  },
};

class SimulatorConnector {
  async execute(config, payload) {
    const provider = PROVIDERS[config?.provider];
    if (!provider) {
      const err = new Error(`SimulatorConnector: unknown provider '${config?.provider}' (known: ${Object.keys(PROVIDERS).join(', ')})`);
      err.code = 'CONFIG_ERROR';
      throw err;
    }
    const start = Date.now();
    const body = provider(payload ?? {});
    return { status: 200, response_body: body, duration_ms: Date.now() - start };
  }
}

module.exports = { SimulatorConnector, SIMULATOR_PROVIDERS: Object.keys(PROVIDERS), _providers: PROVIDERS };
