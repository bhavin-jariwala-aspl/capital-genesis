'use strict';

const SettingsService = require('./settings.service');
const { getTenantId } = require('../middleware/tenant-scope');

/**
 * Tenant settings a report run depends on, added to the scope context built by
 * ReportLibraryService.resolveScope. Today that is the fiscal-year start month
 * (for the "this fiscal year" presets); it is the one place to add more.
 *
 * Cached briefly per tenant: a dashboard with twelve report widgets would
 * otherwise read the settings table twelve times per refresh.
 */
const TTL_MS = 60_000;
const cache = new Map(); // tenantId → { at, fiscal }

async function enrichRunContext(db, ctx = {}, tenantId = getTenantId()) {
  if (!tenantId) return ctx;
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...ctx, fiscal_year_start_month: hit.fiscal };
  let fiscal = 1;
  try {
    const values = await new SettingsService(db).getEffective(tenantId);
    fiscal = Number(values['localization.fiscal_year_start_month']) || 1;
  } catch {
    fiscal = 1;
  }
  cache.set(tenantId, { at: Date.now(), fiscal });
  return { ...ctx, fiscal_year_start_month: fiscal };
}

/** Called when localization settings change so the next run sees the new month. */
function invalidateRunContext(tenantId) {
  if (tenantId === undefined) cache.clear();
  else cache.delete(Number(tenantId));
}

module.exports = { enrichRunContext, invalidateRunContext };
