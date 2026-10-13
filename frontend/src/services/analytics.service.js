import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap } = apiWrapper;

/**
 * Analytics service — live dashboard data.
 * `getDatasets()` powers the builder's dataset picker; `getData()` is what
 * every endpoint-backed widget reads at render time.
 */
export const analyticsService = {
  getDatasets: ()    => wrap(api.get('/analytics/datasets')),
  getData:     (key) => api.get(`/analytics/data/${encodeURIComponent(key)}`)
    .then((r) => ({ data: r.data?.data ?? r.data, meta: r.data?.meta ?? null })),
  // A series / metric over any Builder object (see ObjectAnalyticsService).
  getObjectData: (spec) => api.post('/analytics/object', spec)
    .then((r) => ({ data: r.data?.data ?? r.data, meta: r.data?.meta ?? null })),
};

export default analyticsService;
