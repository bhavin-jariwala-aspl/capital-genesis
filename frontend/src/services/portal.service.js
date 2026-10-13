import axios from 'axios';

/**
 * Client & introducer portal API. A separate realm from staff: its own token
 * (kept per workspace, never sent to /api) and its own base URL.
 */
const tokenKey = (slug) => `genesis-portal:${slug}`;

export const portalToken = {
  get: (slug) => { try { return localStorage.getItem(tokenKey(slug)); } catch { return null; } },
  set: (slug, t) => { try { localStorage.setItem(tokenKey(slug), t); } catch { /* storage blocked */ } },
  clear: (slug) => { try { localStorage.removeItem(tokenKey(slug)); } catch { /* storage blocked */ } },
};

export function portalClient(slug) {
  const http = axios.create({ baseURL: '/api/portal', timeout: 60000, headers: { 'Content-Type': 'application/json' } });
  http.interceptors.request.use((cfg) => {
    const t = portalToken.get(slug);
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
  });
  const data = (p) => p.then((r) => r.data?.data ?? r.data);
  return {
    workspace: () => data(http.get(`/${slug}`)),
    requestCode: (realm, email) => data(http.post(`/${slug}/login/request`, { realm, email })),
    verifyCode: (realm, email, code) => data(http.post(`/${slug}/login/verify`, { realm, email, code })),
    me: () => data(http.get('/me')),
    views: () => data(http.get('/views')),
    list: (object) => data(http.get(`/records/${object}`)),
    options: (object, field) => data(http.get(`/records/${object}/options/${field}`)),
    create: (object, body) => data(http.post(`/records/${object}`, body)),
    documents: () => data(http.get('/documents')),
    download: (id) => http.get(`/documents/${id}/download`, { responseType: 'blob' }),
    upload: (recordId, body) => data(http.post(`/records/${recordId}/documents`, body)),
    messages: () => data(http.get('/messages')),
    sendMessage: (message) => data(http.post('/messages', { message })),
  };
}
