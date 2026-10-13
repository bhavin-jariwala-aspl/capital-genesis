import api from './api';

const wrap = (promise) => promise.then((r) => ({ data: r.data?.data ?? r.data }));

/** /api/access — business units, information barriers, wall-crossings, audit chain. */
export const accessService = {
  getUnits:        ()             => wrap(api.get('/access/business-units')),
  createUnit:      (d)            => wrap(api.post('/access/business-units', d)),
  updateUnit:      (id, d)        => wrap(api.put(`/access/business-units/${id}`, d)),
  setUnitMembers:  (id, ids, primary = []) => wrap(api.put(`/access/business-units/${id}/members`, { employee_ids: ids, primary_ids: primary })),

  getZones:        ()             => wrap(api.get('/access/barrier-zones')),
  createZone:      (d)            => wrap(api.post('/access/barrier-zones', d)),
  updateZone:      (id, d)        => wrap(api.put(`/access/barrier-zones/${id}`, d)),
  addZoneMember:   (id, employeeId) => wrap(api.post(`/access/barrier-zones/${id}/members`, { employee_id: employeeId })),
  removeZoneMember:(id, employeeId) => api.delete(`/access/barrier-zones/${id}/members/${employeeId}`),
  getInsiders:     (id)           => wrap(api.get(`/access/barrier-zones/${id}/insiders`)),

  requestCrossing: (d)            => wrap(api.post('/access/wall-crossings', d)),
  getCrossings:    (status)       => wrap(api.get('/access/wall-crossings', { params: status ? { status } : {} })),
  decideCrossing:  (id, approve, validDays) => wrap(api.post(`/access/wall-crossings/${id}/decide`, { approve, ...(validDays ? { valid_days: validDays } : {}) })),

  getAuditChain:   (params = {})  => wrap(api.get('/access/audit-chain', { params })),
  verifyAuditChain: ()            => wrap(api.get('/access/audit-chain/verify')),
};
