import api from './api';
import { apiWrapper } from './apiWrapper';

export const slaService = {
  // ── Dashboard / radiator ──────────────────────────────────────────────
  getDashboard: (scope = 'me') =>
    apiWrapper.extract(api.get('/sla/dashboard', { params: { scope } })),

  reconcile: () =>
    apiWrapper.extract(api.post('/sla/reconcile')),

  // ── Policies ──────────────────────────────────────────────────────────
  getPolicies: () =>
    apiWrapper.extract(api.get('/sla/policies')),

  getPolicy: (id) =>
    apiWrapper.extract(api.get(`/sla/policies/${id}`)),

  createPolicy: (data) =>
    apiWrapper.extract(api.post('/sla/policies', data)),

  updatePolicy: (id, data) =>
    apiWrapper.extract(api.put(`/sla/policies/${id}`, data)),

  deletePolicy: (id) =>
    apiWrapper.extract(api.delete(`/sla/policies/${id}`)),

  // ── Business hours ────────────────────────────────────────────────────
  getBusinessHours: () =>
    apiWrapper.extract(api.get('/sla/business-hours')),

  createBusinessHours: (data) =>
    apiWrapper.extract(api.post('/sla/business-hours', data)),

  updateBusinessHours: (id, data) =>
    apiWrapper.extract(api.put(`/sla/business-hours/${id}`, data)),

  deleteBusinessHours: (id) =>
    apiWrapper.extract(api.delete(`/sla/business-hours/${id}`)),

  // ── Capabilities ──────────────────────────────────────────────────────
  // What the engine can measure per entity, plus operators and actions. The
  // Builder reads this rather than hard-coding dropdowns that can drift.
  getCapabilities: () =>
    apiWrapper.extract(api.get('/sla/capabilities')),

  // ── Setup ─────────────────────────────────────────────────────────────
  seedDefaults: () =>
    apiWrapper.extract(api.post('/sla/seed-defaults')),
};
