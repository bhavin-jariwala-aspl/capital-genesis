import api from './api';

const wrap = (promise) => promise.then((r) => ({ data: r.data?.data ?? r.data }));

export const runtimeService = {
  // Forecast
  getForecast:     (objectId, params = {}) => wrap(api.get('/runtime/forecast',      { params: { object_id: objectId, ...params } })),
  getTeamForecast: (managerId, objectId, params = {}) =>
    wrap(api.get('/runtime/forecast/team', { params: { manager_id: managerId, object_id: objectId, ...params } })),

  // Import
  listImportJobs:  (objectId)   => wrap(api.get('/runtime/import/jobs', { params: { object_id: objectId } })),
  getImportJob:    (id)         => wrap(api.get(`/runtime/import/jobs/${id}`)),
  createImportJob: (body)       => wrap(api.post('/runtime/import/jobs', body)),
  previewImport:   (id, body)   => wrap(api.post(`/runtime/import/jobs/${id}/preview`, body)),
  executeImport:   (id, body)   => wrap(api.post(`/runtime/import/jobs/${id}/execute`, body)),

  // Manual re-assign
  assignRecord:    (recordId)   => wrap(api.post(`/runtime/records/${recordId}/assign`, {})),

  // Lead scoring analytics (read-only; rules live under Builder)
  getLeadScoreDistribution: ()          => wrap(api.get('/lead-scoring/distribution')),
  getTopLeadScores:         (limit = 5) => wrap(api.get('/lead-scoring/top', { params: { limit } })),
  getLeadScoreAnalytics:    ()          => wrap(api.get('/lead-scoring/analytics')),
};
