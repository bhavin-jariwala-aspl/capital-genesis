'use strict';

jest.mock('@prisma/client');

const BrandingService = require('../src/services/branding.service');
const SettingsService = require('../src/services/settings.service');

/** Prisma double: one tenant row + tenant_configs, recording writes. */
function makePrisma({ tenant = { id: 7, status: 'active', logo_url: null, primary_color: '#6366f1' }, configs = [] } = {}) {
  const store = new Map(configs.map((c) => [c.config_key, c.config_value]));
  const db = {
    tenant: {
      findUnique: jest.fn(async () => tenant),
      update: jest.fn(async ({ data }) => { Object.assign(tenant, data); return tenant; }),
    },
    tenantConfig: {
      findMany: jest.fn(async () => [...store].map(([config_key, config_value]) => ({ config_key, config_value }))),
      upsert: jest.fn(async ({ where, create }) => { store.set(where.tenant_id_config_key.config_key, create.config_value); }),
    },
    $transaction: jest.fn(async (ops) => Promise.all(ops)),
  };
  return { db, tenant, store };
}

function makeStorage() {
  const files = new Map();
  return {
    files,
    put: jest.fn(async (key, buf) => { files.set(key, buf); return { key, size: buf.length }; }),
    delete: jest.fn(async (key) => { files.delete(key); }),
    getStream: jest.fn(async (key) => { if (!files.has(key)) throw new Error('ENOENT'); return { key }; }),
  };
}

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const hash = () => 'abcdef0123456789ffff';

describe('settings schema — appearance group', () => {
  const group = SettingsService.schema.find((g) => g.key === 'appearance');
  const keys = group.settings.map((s) => s.key);

  test('carries the theme, branding, surface and sign-in knobs', () => {
    for (const k of ['theme_preset', 'neutral', 'dark_surface', 'surface_style', 'button_style', 'motion',
      'heading_font', 'sidebar_width', 'nav_active_style', 'logo_display', 'logo_dark_url', 'icon_url',
      'favicon_url', 'login_layout', 'login_image_url', 'login_footer', 'allow_user_density']) {
      expect(keys).toContain(k);
    }
  });

  test('every select has a default that is one of its options', () => {
    for (const s of group.settings.filter((x) => x.type === 'select')) {
      expect(s.options).toContain(s.default);
    }
  });

  test('url settings reject unsafe schemes and accept same-origin asset paths', async () => {
    const { db } = makePrisma();
    const svc = new SettingsService(db);
    await expect(svc.updateSettings(7, 'ADMIN', { 'appearance.icon_url': 'javascript:alert(1)' })).rejects.toThrow(/http\(s\) URL/);
    await expect(svc.updateSettings(7, 'ADMIN', { 'organization.logo_url': 'data:image/png;base64,AAAA' })).rejects.toThrow();
    const res = await svc.updateSettings(7, 'ADMIN', { 'appearance.icon_url': '/api/settings/branding/7/icon_abcdef0123456789.png', 'organization.logo_url': 'https://cdn.example.com/logo.svg' });
    expect(res.values['appearance.icon_url']).toBe('/api/settings/branding/7/icon_abcdef0123456789.png');
    expect(res.values['organization.logo_url']).toBe('https://cdn.example.com/logo.svg');
  });
});

describe('BrandingService.uploadAsset', () => {
  test('stores the file under a tenant-first hashed key and points the setting at it', async () => {
    const { db, tenant } = makePrisma();
    const storage = makeStorage();
    const svc = new BrandingService(db, { storage, hash });
    const out = await svc.uploadAsset(7, 'ADMIN001', { kind: 'logo', mimeType: 'image/png', data: PNG.toString('base64') });
    expect(storage.put).toHaveBeenCalledWith('7/branding/logo_abcdef0123456789.png', expect.any(Buffer));
    expect(out.url).toBe('/api/settings/branding/7/logo_abcdef0123456789.png');
    expect(tenant.logo_url).toBe(out.url);           // organization.logo_url is a tenants column
    expect(out.settings.values['organization.logo_url']).toBe(out.url);
  });

  test('accepts a data: URL prefix and writes non-column kinds to tenant_configs', async () => {
    const { db, store } = makePrisma();
    const svc = new BrandingService(db, { storage: makeStorage(), hash });
    const out = await svc.uploadAsset(7, 'A', { kind: 'favicon', mimeType: 'image/x-icon', data: `data:image/x-icon;base64,${PNG.toString('base64')}` });
    expect(out.url).toMatch(/\/favicon_[a-f0-9]{16}\.ico$/);
    expect(store.get('appearance.favicon_url')).toBe(out.url);
  });

  test('deletes the previously stored asset when it is replaced', async () => {
    const { db } = makePrisma({ tenant: { id: 7, status: 'active', logo_url: '/api/settings/branding/7/logo_0000000000000000.png', primary_color: null } });
    const storage = makeStorage();
    const svc = new BrandingService(db, { storage, hash });
    await svc.uploadAsset(7, 'A', { kind: 'logo', mimeType: 'image/png', data: PNG });
    expect(storage.delete).toHaveBeenCalledWith('7/branding/logo_0000000000000000.png');
  });

  test('never deletes a foreign URL and ignores other tenants\' keys', async () => {
    expect(BrandingService.keyForUrl(7, 'https://cdn.example.com/logo.png')).toBeNull();
    expect(BrandingService.keyForUrl(7, '/api/settings/branding/8/logo_0000000000000000.png')).toBeNull();
    expect(BrandingService.keyForUrl(7, '/api/settings/branding/7/../secret')).toBeNull();
    expect(BrandingService.keyForUrl(7, '/api/settings/branding/7/logo_0000000000000000.png')).toBe('7/branding/logo_0000000000000000.png');
  });

  test('rejects unknown kinds, bad mime types, empty, oversized and scripted SVG', async () => {
    const svc = new BrandingService(makePrisma().db, { storage: makeStorage(), hash });
    await expect(svc.uploadAsset(7, 'A', { kind: 'banner', mimeType: 'image/png', data: PNG })).rejects.toThrow(/Unknown brand asset/);
    await expect(svc.uploadAsset(7, 'A', { kind: 'logo', mimeType: 'image/gif', data: PNG })).rejects.toThrow(/PNG, JPEG/);
    await expect(svc.uploadAsset(7, 'A', { kind: 'logo', mimeType: 'image/png', data: '' })).rejects.toThrow(/base64/);
    await expect(svc.uploadAsset(7, 'A', { kind: 'logo', mimeType: 'image/png', data: Buffer.alloc(1024 * 1024 + 1) })).rejects.toThrow(/exceeds 1 MB/);
    const evil = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>1</script></svg>');
    await expect(svc.uploadAsset(7, 'A', { kind: 'logo', mimeType: 'image/svg+xml', data: evil })).rejects.toThrow(/scripts/);
    const fine = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>');
    await expect(svc.uploadAsset(7, 'A', { kind: 'logo', mimeType: 'image/svg+xml', data: fine })).resolves.toMatchObject({ kind: 'logo' });
  });
});

describe('BrandingService.removeAsset / openAsset / publicBranding', () => {
  test('removeAsset clears the setting and deletes our file', async () => {
    const { db, tenant } = makePrisma({ tenant: { id: 7, status: 'active', logo_url: '/api/settings/branding/7/logo_0000000000000000.png', primary_color: null } });
    const storage = makeStorage();
    const svc = new BrandingService(db, { storage, hash });
    const out = await svc.removeAsset(7, 'A', 'logo');
    expect(out.url).toBeNull();
    expect(tenant.logo_url).toBeNull();
    expect(storage.delete).toHaveBeenCalledWith('7/branding/logo_0000000000000000.png');
  });

  test('openAsset only serves well-formed filenames and 404s otherwise', async () => {
    const storage = makeStorage();
    storage.files.set('7/branding/icon_abcdef0123456789.png', PNG);
    const svc = new BrandingService(makePrisma().db, { storage, hash });
    await expect(svc.openAsset(7, 'icon_abcdef0123456789.png')).resolves.toMatchObject({ mimeType: 'image/png' });
    await expect(svc.openAsset(7, '../../etc/passwd')).rejects.toThrow(/not found/);
    await expect(svc.openAsset(7, 'icon_abcdef0123456789.exe')).rejects.toThrow(/not found/);
    await expect(svc.openAsset(7, 'icon_0000000000000000.png')).rejects.toThrow(/not found/); // not stored
    await expect(svc.openAsset('x', 'icon_abcdef0123456789.png')).rejects.toThrow(/not found/);
  });

  test('publicBranding exposes only brand-facing settings', async () => {
    const { db } = makePrisma({ configs: [
      { config_key: 'appearance.app_name', config_value: 'Acme Assurance' },
      { config_key: 'security.require_mfa', config_value: 'true' },
      { config_key: 'localization.currency', config_value: 'INR' },
    ] });
    const svc = new BrandingService(db, { storage: makeStorage(), hash });
    const pub = await svc.publicBranding(7);
    expect(pub.tenant_id).toBe(7);
    expect(pub['appearance.app_name']).toBe('Acme Assurance');
    expect(pub['organization.primary_color']).toBe('#6366f1');
    expect(pub['security.require_mfa']).toBeUndefined();
    expect(pub['localization.currency']).toBeUndefined();
    expect(pub['organization.billing_email']).toBeUndefined();
  });

  test('publicBranding hides deleted tenants and bad ids', async () => {
    const svc = new BrandingService(makePrisma({ tenant: { id: 9, status: 'deleted' } }).db, { storage: makeStorage(), hash });
    await expect(svc.publicBranding(9)).rejects.toThrow(/not found/);
    await expect(svc.publicBranding('abc')).rejects.toThrow(/not found/);
  });
});
