import api from './api';
import { apiWrapper } from './apiWrapper';

/**
 * Report API client.
 *
 * Every dropdown the report builder shows is populated from the server
 * (`getSources` / `getVocabulary`), so the UI never hard-codes a field name,
 * operator or aggregation that the engine might not support.
 */
/** Plan + execute + summary on a laptop-class model; the server allows 90 s per model call. */
const AI_TIMEOUT_MS = 200_000;

export const reportService = {
  // Builder metadata
  getSources:     () => apiWrapper.extract(api.get('/reports/sources')),
  getVocabulary:  () => apiWrapper.extract(api.get('/reports/vocabulary')),
  getTemplates:   () => apiWrapper.extract(api.get('/reports/templates')),
  getTemplate:    (key) => apiWrapper.extract(api.get(`/reports/templates/${key}`)),
  getFieldValues: (source, field) =>
    apiWrapper.extract(api.get('/reports/field-values', { params: { source, field } })),

  // Library
  list: (params = {}) => apiWrapper.extract(api.get('/reports', { params })),
  get: (id) => apiWrapper.extract(api.get(`/reports/${id}`)),
  create: (data) => apiWrapper.extract(api.post('/reports', data)),
  update: (id, data) => apiWrapper.extract(api.put(`/reports/${id}`, data)),
  remove: (id) => apiWrapper.extract(api.delete(`/reports/${id}`)),
  duplicate: (id) => apiWrapper.extract(api.post(`/reports/${id}/duplicate`)),
  setFavorite: (id, on) => apiWrapper.extract(api.post(`/reports/${id}/favorite`, { on })),
  history: (id) => apiWrapper.extract(api.get(`/reports/${id}/history`)),

  // Folders
  listFolders: () => apiWrapper.extract(api.get('/reports/folders')),
  createFolder: (data) => apiWrapper.extract(api.post('/reports/folders', data)),
  updateFolder: (id, data) => apiWrapper.extract(api.put(`/reports/folders/${id}`, data)),
  deleteFolder: (id) => apiWrapper.extract(api.delete(`/reports/folders/${id}`)),

  // Running. `params` answers the report's prompted filters ({ key: value });
  // `global` carries dashboard-level filters ({ date_range, owner }).
  run: (config, scope, params) => apiWrapper.extract(api.post('/reports/run', { config, scope, params })),
  runSaved: (id, scope, params) => apiWrapper.extract(api.post(`/reports/${id}/run`, { scope, params })),
  drilldown: (config, keys, scope, params, global) =>
    apiWrapper.extract(api.post('/reports/drilldown', { config, keys, scope, params, global })),

  /** The report's own headline numbers over time (see report-snapshots.js). */
  snapshots: (id, scope) => apiWrapper.extract(api.get(`/reports/${id}/snapshots`, { params: { scope } })),

  /** A saved report reshaped for a dashboard widget, optionally under dashboard filters. */
  widgetData: (id, shape, scope, global) =>
    api.get(`/reports/${id}/data`, {
      params: {
        shape, scope,
        date_range: Array.isArray(global?.date_range) ? global.date_range.join(',') : global?.date_range || undefined,
        owner: Array.isArray(global?.owner) ? global.owner.join(',') : global?.owner || undefined,
      },
    }).then((r) => r.data),

  // Export — CSV / Excel come back as a Blob; print opens server-rendered HTML.
  exportFile: (config, { format = 'csv', scope, name, params } = {}) =>
    api.post('/reports/export', { config, format, scope, name, params }, { responseType: 'blob' }).then((r) => r.data),
  exportSaved: (id, { format = 'csv', scope, params } = {}) =>
    api.post(`/reports/${id}/export`, { format, scope, params }, { responseType: 'blob' }).then((r) => r.data),
  /**
   * Print view. Fetched through the axios client rather than linked to directly:
   * the JWT lives in memory and is attached by an interceptor, so a plain
   * `<a href="/api/…">` would arrive without an Authorization header and 401.
   */
  printHtml: (id, scope, params) =>
    api.get(`/reports/${id}/print`, {
      params: { scope: scope || undefined, params: params && Object.keys(params).length ? JSON.stringify(params) : undefined },
      responseType: 'text',
    }).then((r) => r.data),

  // AI ("Ask") — a report config from a question; never SQL. See AI_REPORTING.md.
  aiStatus: () => apiWrapper.extract(api.get('/ai-reports/status')),
  aiSuggestions: () => apiWrapper.extract(api.get('/ai-reports/suggestions')),
  // A local model can take a minute or more to plan and summarise, so these two
  // calls get their own timeout instead of the client default.
  ask: (message, { history, scope, force_viz, want_summary = true } = {}) =>
    apiWrapper.extract(api.post('/ai-reports/ask', { message, history, scope, options: { force_viz, want_summary } }, { timeout: AI_TIMEOUT_MS })),
  explain: (title, result, scope) =>
    apiWrapper.extract(api.post('/ai-reports/explain', { title, result, scope }, { timeout: AI_TIMEOUT_MS })),

  // Scheduled delivery
  listSubscriptions: (id) => apiWrapper.extract(api.get(`/reports/${id}/subscriptions`)),
  mySubscriptions: () => apiWrapper.extract(api.get('/reports/my-subscriptions')),
  createSubscription: (id, data) => apiWrapper.extract(api.post(`/reports/${id}/subscriptions`, data)),
  updateSubscription: (subId, data) => apiWrapper.extract(api.put(`/reports/subscriptions/${subId}`, data)),
  deleteSubscription: (subId) => apiWrapper.extract(api.delete(`/reports/subscriptions/${subId}`)),
  sendSubscriptionNow: (subId) => apiWrapper.extract(api.post(`/reports/subscriptions/${subId}/send-now`)),
};

/**
 * Open the server-rendered print view in a new tab, so the browser's own
 * "Save as PDF" can be used. The window is opened *before* the request so the
 * click is still the user gesture that opened it (pop-up blockers otherwise
 * reject a window opened from an async continuation).
 */
export async function openPrintView(id, scope, params) {
  const tab = window.open('', '_blank');
  try {
    const html = await reportService.printHtml(id, scope, params);
    if (!tab) return;
    tab.document.open();
    tab.document.write(html);
    tab.document.close();
  } catch (e) {
    if (tab) tab.close();
    throw e;
  }
}

/** Trigger a browser download for a Blob returned by one of the export calls. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default reportService;
