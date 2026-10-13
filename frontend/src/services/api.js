import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';
import { localizeMetadata } from '../utils/localize';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, try once to renew the session with the refresh token (PRD E-01);
// concurrent 401s share one refresh. If that fails, sign out.
let refreshing = null;
async function renewSession() {
  const { refreshToken, setTokens } = useAuthStore.getState();
  if (!refreshToken) throw new Error('no refresh token');
  const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken });
  const s = res.data?.data ?? res.data;
  setTokens(s.token, s.refresh_token);
  return s.token;
}

api.interceptors.response.use(
  // Runtime metadata reads show French labels to users who chose French.
  (res) => {
    if (String(res.config?.url ?? '').startsWith('/runtime/')) localizeMetadata(res.data, useLanguageStore.getState().lang);
    return res;
  },
  async (error) => {
    const original = error.config ?? {};
    const isAuthCall = /\/auth\/(login|refresh|mfa)/.test(String(original.url ?? ''));
    if (error.response?.status === 401 && !original._retried && !isAuthCall && useAuthStore.getState().refreshToken) {
      original._retried = true;
      try {
        refreshing = refreshing ?? renewSession().finally(() => { refreshing = null; });
        const token = await refreshing;
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${token}` };
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
    }
    if (error.response?.status === 401 && !isAuthCall) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

export default api;
