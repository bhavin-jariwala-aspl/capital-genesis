'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const {
  DEFAULT_CURRENCY,
  getCurrency,
  formatCurrency,
  roundToCurrency,
} = require('../utils/currency');

/**
 * CurrencyService — resolves the display currency for a tenant and hands back a
 * ready-to-use formatter.
 *
 * The tenant's choice lives in BUILDER > Settings > Localization
 * (`localization.currency`, plus `localization.locale` and
 * `localization.number_format` for grouping). Those three keys change rarely
 * but are read on nearly every money render, so the resolved formatter is
 * memoised per tenant behind a short TTL.
 *
 * `SettingsService.updateSettings` calls `CurrencyService.invalidate(tenantId)`
 * so an admin's save takes effect immediately rather than after the TTL — the
 * TTL only bounds staleness for writes that bypass the service (seeds, SQL).
 *
 * NOTE: this is a *display* currency, not a transaction currency. Amounts are
 * stored as entered; nothing here converts between currencies. See
 * docs/developer-guide/engines/currency.md for where that boundary sits.
 */

const TTL_MS = 5 * 60 * 1000;

/** tenantId → { expires:number, profile:CurrencyProfile } */
const cache = new Map();

/**
 * Request-scoped active profile.
 *
 * Money is rendered deep inside synchronous builders (report formatting,
 * template merges), so threading a profile through every signature is not
 * practical. AsyncLocalStorage gives those sync helpers a
 * request-scoped value without a shared mutable — the same mechanism
 * `middleware/tenant-scope.js` already uses for tenant_id.
 */
const currencyContext = new AsyncLocalStorage();

/**
 * @typedef {object} CurrencyProfile
 * @property {string}   code          ISO 4217 code
 * @property {string}   symbol
 * @property {string}   name
 * @property {number}   decimals
 * @property {string}   locale        BCP-47 tag used for grouping/ordering
 * @property {string}   numberFormat  the tenant's `number_format` setting
 * @property {(v:any, o?:object) => string} format
 * @property {(v:any) => number|null}       round
 */

/** Build a self-contained profile from three raw setting values. */
function buildProfile({ code, locale, numberFormat }) {
  const cur = getCurrency(code);
  const opts = { code: cur.code, locale, numberFormat };
  return {
    code:         cur.code,
    symbol:       cur.symbol,
    name:         cur.name,
    decimals:     cur.decimals,
    locale:       locale || 'en-US',
    numberFormat: numberFormat || '1,234.56',
    format: (value, extra) => formatCurrency(value, { ...opts, ...extra }),
    round:  (value) => roundToCurrency(value, cur.code),
  };
}

/** The profile used before settings resolve, and for unauthenticated contexts. */
const FALLBACK_PROFILE = buildProfile({ code: DEFAULT_CURRENCY, locale: 'en-US', numberFormat: '1,234.56' });

class CurrencyService {
  /** @param {import('@prisma/client').PrismaClient} prisma */
  constructor(prisma) {
    this.db = prisma;
  }

  /** Drop a tenant's memoised profile (or the whole cache when called bare). */
  static invalidate(tenantId) {
    if (tenantId === undefined || tenantId === null) cache.clear();
    else cache.delete(Number(tenantId));
  }

  /** The USD/en-US profile, for code paths with no tenant in scope. */
  static get fallback() { return FALLBACK_PROFILE; }

  /**
   * The memoised profile for a tenant, or null when it is not cached (or has
   * expired). Synchronous — used by the authenticate hook, which cannot await
   * before installing request context.
   */
  static peek(tenantId) {
    const hit = cache.get(Number(tenantId));
    return hit && hit.expires > Date.now() ? hit.profile : null;
  }

  /**
   * Memoise every active tenant's profile. Called once at boot so the first
   * request per tenant already has its currency in scope.
   * @returns {Promise<number>} tenants warmed
   */
  async warmAll() {
    let tenants = [];
    try {
      tenants = await this.db.tenant.findMany({ select: { id: true } });
    } catch { return 0; }
    await Promise.allSettled(tenants.map((t) => this.getProfile(t.id)));
    return tenants.length;
  }

  /**
   * The profile in scope for the current async context, or the USD fallback.
   * Safe to call from synchronous code.
   * @returns {CurrencyProfile}
   */
  static activeProfile() {
    return currencyContext.getStore() ?? FALLBACK_PROFILE;
  }

  /**
   * Run `fn` with the tenant's profile installed as the active profile, so any
   * synchronous formatter it reaches renders in the tenant's currency.
   *
   * @param {number|string} tenantId
   * @param {() => T|Promise<T>} fn
   * @returns {Promise<T>}
   * @template T
   */
  async withProfile(tenantId, fn) {
    const profile = await this.getProfile(tenantId);
    return currencyContext.run(profile, fn);
  }

  /**
   * Resolve a tenant's currency profile.
   * Never throws: a settings read failure degrades to the fallback profile so a
   * PDF or export still renders rather than 500-ing on a formatting concern.
   *
   * @param {number|string} tenantId
   * @returns {Promise<CurrencyProfile>}
   */
  async getProfile(tenantId) {
    const tid = Number(tenantId);
    if (!Number.isFinite(tid)) return FALLBACK_PROFILE;

    const hit = cache.get(tid);
    if (hit && hit.expires > Date.now()) return hit.profile;

    let profile = FALLBACK_PROFILE;
    try {
      // Required lazily: SettingsService is a peer service and eager-requiring
      // it here would create a cycle (settings → currency → settings).
      const SettingsService = require('./settings.service');
      const values = await new SettingsService(this.db).getEffective(tid);
      profile = buildProfile({
        code:         values['localization.currency'],
        locale:       values['localization.locale'],
        numberFormat: values['localization.number_format'],
      });
    } catch {
      // Leave `profile` as the fallback; do not cache a failed read for long.
      cache.set(tid, { expires: Date.now() + 30_000, profile });
      return profile;
    }

    cache.set(tid, { expires: Date.now() + TTL_MS, profile });
    return profile;
  }

  /** Convenience: format a single amount in the tenant's currency. */
  async format(tenantId, value, opts) {
    return (await this.getProfile(tenantId)).format(value, opts);
  }
}

module.exports = CurrencyService;
module.exports.buildProfile = buildProfile;
module.exports.currencyContext = currencyContext;
