import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap } = apiWrapper;

/** Read a File as a base64 string (no data: prefix). */
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

/**
 * Application (organization) settings API.
 * GET returns `{ schema, values }`; the UI renders generically from `schema`.
 */
export const settingsService = {
  /** Fetch schema + effective values. */
  get: () => wrap(api.get('/settings')),

  /** Flat effective values only (programmatic use). */
  getEffective: () => wrap(api.get('/settings/effective')),

  /** Update settings (admin only). `values` is a map of "group.key" → value. */
  update: (values) => wrap(api.put('/settings', { values })),

  /**
   * Upload a brand asset (admin). `kind` is logo | logo_dark | icon | favicon | login_image.
   * Returns `{ kind, url, size, settings }`; the matching setting already points at the new URL.
   */
  uploadBrandAsset: async (kind, file) => {
    const data = await fileToBase64(file);
    return wrap(api.post('/settings/branding/assets', { kind, filename: file.name, mime_type: file.type, data }));
  },

  /** Remove a brand asset (admin) — clears the setting and deletes the stored file. */
  removeBrandAsset: (kind) => wrap(api.delete(`/settings/branding/assets/${kind}`)),

  /** Public (pre-login) branding for a workspace. */
  getPublicBranding: (tenantId) => wrap(api.get(`/settings/branding/public/${tenantId}`)),
};
