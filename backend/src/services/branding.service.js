'use strict';

const path = require('path');
const { ValidationError, NotFoundError } = require('../utils/errors');
const SettingsService = require('./settings.service');

/**
 * BrandingService — tenant brand assets (logo, dark logo, app icon, favicon,
 * sign-in artwork) and the public, pre-login view of a tenant's appearance.
 *
 * Assets are stored through the shared StorageProvider under a tenant-first
 * key (`{tenant}/branding/{kind}_{hash}.{ext}`) and referenced from the
 * settings layer by URL (`/api/settings/branding/{tenant}/{file}`). The hash
 * in the filename makes each URL immutable, so the asset route can send long
 * cache headers and a re-upload never shows a stale logo.
 *
 * Nothing here needs a migration: the URLs live in the existing
 * `tenants.logo_url` column and `tenant_configs` rows.
 */

/** Asset kind → the setting that stores its URL. */
const ASSET_KINDS = Object.freeze({
  logo:        'organization.logo_url',
  logo_dark:   'appearance.logo_dark_url',
  icon:        'appearance.icon_url',
  favicon:     'appearance.favicon_url',
  login_image: 'appearance.login_image_url',
});

const MIME_EXT = Object.freeze({
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
  'image/x-icon':  'ico',
  'image/vnd.microsoft.icon': 'ico',
});
const EXT_MIME = Object.freeze({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon' });

/** Size caps (bytes). Logos are small by nature; artwork may be a photo. */
const MAX_BYTES = Object.freeze({ default: 1024 * 1024, login_image: 4 * 1024 * 1024 });

/** `{kind}_{16 hex}.{ext}` — the only filenames the public route will serve. */
const ASSET_FILE_RE = /^(logo|logo_dark|icon|favicon|login_image)_([a-f0-9]{16})\.(png|jpg|webp|svg|ico)$/;

/** Settings every visitor may see before signing in (nothing operational). */
const PUBLIC_KEYS = [
  'organization.company_name', 'organization.logo_url', 'organization.primary_color',
];
const PUBLIC_GROUP_PREFIX = 'appearance.';

class BrandingService {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {{ storage?: import('./storage/StorageProvider').StorageProvider, hash?: (buf: Buffer) => string }} [deps]
   */
  constructor(prisma, deps = {}) {
    this.db = prisma;
    this.settings = new SettingsService(prisma);
    // Lazy so unit tests can inject a fake without touching the filesystem.
    this._storage = deps.storage ?? null;
    this._hash = deps.hash ?? null;
  }

  get storage() {
    if (!this._storage) this._storage = require('./storage').getStorage();
    return this._storage;
  }

  hash(buffer) {
    if (!this._hash) this._hash = require('./storage').hashBuffer;
    return this._hash(buffer);
  }

  /**
   * Store an uploaded brand asset and point the matching setting at it.
   * @param {number} tenantId
   * @param {string} adminId
   * @param {{ kind: string, mimeType: string, data: string|Buffer, filename?: string }} input
   * @returns {Promise<{ kind: string, url: string, size: number, settings: object }>}
   */
  async uploadAsset(tenantId, adminId, { kind, mimeType, data }) {
    const settingKey = ASSET_KINDS[kind];
    if (!settingKey) throw new ValidationError(`Unknown brand asset kind: ${kind}`);
    const ext = MIME_EXT[String(mimeType || '').toLowerCase()];
    if (!ext) throw new ValidationError('Brand assets must be PNG, JPEG, WebP, SVG or ICO');

    let buffer;
    if (Buffer.isBuffer(data)) buffer = data;
    else {
      const b64 = String(data ?? '').replace(/^data:[^;]+;base64,/, '');
      if (!b64 || /[^A-Za-z0-9+/=\r\n]/.test(b64)) throw new ValidationError('Asset data must be base64');
      buffer = Buffer.from(b64, 'base64');
    }
    if (!buffer.length) throw new ValidationError('Asset is empty');
    const cap = MAX_BYTES[kind] ?? MAX_BYTES.default;
    if (buffer.length > cap) throw new ValidationError(`Asset exceeds ${Math.round(cap / 1024 / 1024)} MB`);
    if (ext === 'svg') BrandingService.assertSafeSvg(buffer);

    const tid = Number(tenantId);
    const file = `${kind}_${this.hash(buffer).slice(0, 16)}.${ext}`;
    const key = `${tid}/branding/${file}`;
    await this.storage.put(key, buffer);
    const url = `/api/settings/branding/${tid}/${file}`;

    const previous = (await this.settings.getEffective(tid))[settingKey];
    const settings = await this.settings.updateSettings(tid, adminId, { [settingKey]: url });
    await this.#discard(tid, previous, url);
    return { kind, url, size: buffer.length, settings };
  }

  /** Clear an asset's setting and best-effort delete the stored file. */
  async removeAsset(tenantId, adminId, kind) {
    const settingKey = ASSET_KINDS[kind];
    if (!settingKey) throw new ValidationError(`Unknown brand asset kind: ${kind}`);
    const tid = Number(tenantId);
    const previous = (await this.settings.getEffective(tid))[settingKey];
    const settings = await this.settings.updateSettings(tid, adminId, { [settingKey]: null });
    await this.#discard(tid, previous, null);
    return { kind, url: null, settings };
  }

  /** Delete a previously stored asset if it was ours and is no longer referenced. */
  async #discard(tid, previousUrl, currentUrl) {
    const key = BrandingService.keyForUrl(tid, previousUrl);
    if (!key || previousUrl === currentUrl) return;
    try { await this.storage.delete(key); } catch { /* best effort */ }
  }

  /** Map one of our asset URLs back to its storage key (null for foreign URLs). */
  static keyForUrl(tenantId, url) {
    const m = /^\/api\/settings\/branding\/(\d+)\/([^/?#]+)$/.exec(String(url ?? ''));
    if (!m || Number(m[1]) !== Number(tenantId) || !ASSET_FILE_RE.test(m[2])) return null;
    return `${Number(tenantId)}/branding/${m[2]}`;
  }

  /**
   * Open a stored asset for the public route.
   * @returns {Promise<{ stream: NodeJS.ReadableStream, mimeType: string }>}
   */
  async openAsset(tenantId, file) {
    const tid = Number(tenantId);
    if (!Number.isInteger(tid) || tid <= 0 || !ASSET_FILE_RE.test(String(file))) {
      throw new NotFoundError('Brand asset not found');
    }
    const mimeType = EXT_MIME[path.extname(file).slice(1)];
    try {
      const stream = await this.storage.getStream(`${tid}/branding/${file}`);
      return { stream, mimeType };
    } catch {
      throw new NotFoundError('Brand asset not found');
    }
  }

  /**
   * The subset of settings a visitor may see before signing in — what the
   * sign-in page needs to wear the tenant's brand.
   */
  async publicBranding(tenantId) {
    const tid = Number(tenantId);
    if (!Number.isInteger(tid) || tid <= 0) throw new NotFoundError('Workspace not found');
    const tenant = await this.db.tenant.findUnique({ where: { id: tid }, select: { id: true, status: true } });
    if (!tenant || ['deleted', 'cancelled'].includes(tenant.status)) throw new NotFoundError('Workspace not found');
    const values = await this.settings.getEffective(tid);
    const out = { tenant_id: tid };
    for (const [k, v] of Object.entries(values)) {
      if (PUBLIC_KEYS.includes(k) || k.startsWith(PUBLIC_GROUP_PREFIX)) out[k] = v;
    }
    return out;
  }

  /**
   * Reject SVGs that could run script when rendered inline. Logos are shown
   * through <img>, which never executes script, but an admin could paste the
   * URL elsewhere — so refuse the risky ones outright.
   */
  static assertSafeSvg(buffer) {
    const text = buffer.toString('utf8');
    if (!/<svg[\s>]/i.test(text)) throw new ValidationError('Not a valid SVG');
    if (/<script[\s>]|\son[a-z]+\s*=|javascript:|<foreignObject|<iframe|<embed|<object/i.test(text)) {
      throw new ValidationError('SVG logos may not contain scripts, event handlers or embedded documents');
    }
  }
}

module.exports = BrandingService;
BrandingService.ASSET_KINDS = ASSET_KINDS;
BrandingService.ASSET_FILE_RE = ASSET_FILE_RE;
