import api from './api';

const BASE = '/platform';

export const platformService = {
  // ── Tenants ────────────────────────────────────────────────
  listTenants:       (params) => api.get(`${BASE}/tenants`, { params }).then(r => r.data),
  getTenantStats:    ()       => api.get(`${BASE}/tenants/stats`).then(r => r.data),
  getTenant:         (id)     => api.get(`${BASE}/tenants/${id}`).then(r => r.data),
  createTenant:      (data)   => api.post(`${BASE}/tenants`, data).then(r => r.data),
  updateTenant:      (id, d)  => api.put(`${BASE}/tenants/${id}`, d).then(r => r.data),
  suspendTenant:     (id, d)  => api.post(`${BASE}/tenants/${id}/suspend`, d).then(r => r.data),
  reactivateTenant:  (id)     => api.post(`${BASE}/tenants/${id}/reactivate`).then(r => r.data),
  deleteTenant:      (id)     => api.delete(`${BASE}/tenants/${id}`).then(r => r.data),
  restoreTenant:     (id)     => api.post(`${BASE}/tenants/${id}/restore`).then(r => r.data),
  changeTenantPlan:  (id, d)  => api.post(`${BASE}/tenants/${id}/change-plan`, d).then(r => r.data),
  provisionAdmin:    (id, d)  => api.post(`${BASE}/tenants/${id}/provision-admin`, d).then(r => r.data),
  getTenantConfig:   (id)     => api.get(`${BASE}/tenants/${id}/config`).then(r => r.data),
  setTenantConfig:   (id, d)  => api.put(`${BASE}/tenants/${id}/config`, d).then(r => r.data),
  deleteTenantConfig:(id, k)  => api.delete(`${BASE}/tenants/${id}/config/${k}`).then(r => r.data),
  getTenantUsage:    (id, p)  => api.get(`${BASE}/tenants/${id}/usage`, { params: p }).then(r => r.data),
  provisionTemplates:(id, d)  => api.post(`${BASE}/tenants/${id}/provision-templates`, d).then(r => r.data),
  getIndustries:     ()       => api.get(`${BASE}/industries`).then(r => r.data),

  // ── Onboarding ─────────────────────────────────────────────
  // `onboardTenant` creates the tenant AND everything that makes it usable in
  // one request; the rest support the wizard's live feedback and the
  // per-tenant setup checklist. See docs/platform-operations/tenant-onboarding.md.
  onboardTenant:     (data)   => api.post(`${BASE}/tenants/onboard`, data).then(r => r.data),
  getProvisioningSteps: ()    => api.get(`${BASE}/tenants/provisioning-steps`).then(r => r.data),
  checkTenantSlug:   (slug)   => api.get(`${BASE}/tenants/check-slug`, { params: { slug } }).then(r => r.data),
  checkTenantAdmin:  (params) => api.get(`${BASE}/tenants/check-admin`, { params }).then(r => r.data),
  getTenantReadiness:(id)     => api.get(`${BASE}/tenants/${id}/readiness`).then(r => r.data),
  provisionTenant:   (id, d)  => api.post(`${BASE}/tenants/${id}/provision`, d).then(r => r.data),

  // ── Feature entitlements ───────────────────────────────────
  // Three inputs decide whether a tenant has a feature — the plan (what was
  // sold), the flag (whether we shipped it) and a per-tenant override (the
  // deliberate exception). The matrix returns all three plus the reason.
  getFeatureCatalogue: ()     => api.get(`${BASE}/feature-catalogue`).then(r => r.data),
  getTenantFeatures: (id)     => api.get(`${BASE}/tenants/${id}/features`).then(r => r.data),
  setTenantFeature:  (id, key, enabled) => api.put(`${BASE}/tenants/${id}/features/${key}`, { enabled }).then(r => r.data),
  setTenantFeatures: (id, features)     => api.put(`${BASE}/tenants/${id}/features`, { features }).then(r => r.data),
  resetPlanFeatures: (id)     => api.post(`${BASE}/plans/${id}/reset-features`).then(r => r.data),

  // ── Audit Log ──────────────────────────────────────────────
  listAuditLog:      (params) => api.get(`${BASE}/audit-log`, { params }).then(r => r.data),
  getAuditStats:     (params) => api.get(`${BASE}/audit-log/stats`, { params }).then(r => r.data),
  getTargetHistory:  (t, id)  => api.get(`${BASE}/audit-log/target/${t}/${id}`).then(r => r.data),

  // ── Impersonation ──────────────────────────────────────────
  startImpersonation: (data)  => api.post(`${BASE}/impersonate`, data).then(r => r.data),
  endImpersonation:   (id, d) => api.post(`${BASE}/impersonate/${id}/end`, d).then(r => r.data),
  listImpersonationLogs: (p)  => api.get(`${BASE}/impersonation-logs`, { params: p }).then(r => r.data),

  // ── Announcements ──────────────────────────────────────────
  listAnnouncements: (params) => api.get(`${BASE}/announcements`, { params }).then(r => r.data),
  getAnnouncement:   (id)     => api.get(`${BASE}/announcements/${id}`).then(r => r.data),
  createAnnouncement:(data)   => api.post(`${BASE}/announcements`, data).then(r => r.data),
  updateAnnouncement:(id, d)  => api.put(`${BASE}/announcements/${id}`, d).then(r => r.data),
  deleteAnnouncement:(id)     => api.delete(`${BASE}/announcements/${id}`).then(r => r.data),
  activateAnnouncement:(id)   => api.post(`${BASE}/announcements/${id}/activate`).then(r => r.data),
  deactivateAnnouncement:(id) => api.post(`${BASE}/announcements/${id}/deactivate`).then(r => r.data),

  // ── Feature Flags ──────────────────────────────────────────
  listFeatureFlags:  (params) => api.get(`${BASE}/feature-flags`, { params }).then(r => r.data),
  getFeatureFlag:    (id)     => api.get(`${BASE}/feature-flags/${id}`).then(r => r.data),
  createFeatureFlag: (data)   => api.post(`${BASE}/feature-flags`, data).then(r => r.data),
  updateFeatureFlag: (id, d)  => api.put(`${BASE}/feature-flags/${id}`, d).then(r => r.data),
  toggleFeatureFlag: (id, d)  => api.post(`${BASE}/feature-flags/${id}/toggle`, d).then(r => r.data),
  setFlagRollout:    (id, d)  => api.post(`${BASE}/feature-flags/${id}/rollout`, d).then(r => r.data),
  deleteFeatureFlag: (id)     => api.delete(`${BASE}/feature-flags/${id}`).then(r => r.data),
  getTenantFlags:    (tid)    => api.get(`${BASE}/feature-flags/tenant/${tid}`).then(r => r.data),
  setTenantFlagOverride:(id,d)=> api.post(`${BASE}/feature-flags/${id}/tenant-override`, d).then(r => r.data),
  removeTenantFlagOverride:(id, tid) => api.delete(`${BASE}/feature-flags/${id}/tenant-override/${tid}`).then(r => r.data),

  // ── Subscription Plans ─────────────────────────────────────
  listPlans:         ()       => api.get(`${BASE}/plans`).then(r => r.data),
  comparePlans:      ()       => api.get(`${BASE}/plans/compare`).then(r => r.data),
  getPlan:           (id)     => api.get(`${BASE}/plans/${id}`).then(r => r.data),
  createPlan:        (data)   => api.post(`${BASE}/plans`, data).then(r => r.data),
  updatePlan:        (id, d)  => api.put(`${BASE}/plans/${id}`, d).then(r => r.data),
  deletePlan:        (id)     => api.delete(`${BASE}/plans/${id}`).then(r => r.data),

  // ── Analytics ──────────────────────────────────────────────
  getOverview:       ()       => api.get(`${BASE}/analytics/overview`).then(r => r.data),
  getTenantGrowth:   (params) => api.get(`${BASE}/analytics/tenant-growth`, { params }).then(r => r.data),
  getFeatureUsage:   ()       => api.get(`${BASE}/analytics/feature-usage`).then(r => r.data),
  getUserActivity:   (params) => api.get(`${BASE}/analytics/user-activity`, { params }).then(r => r.data),
  getSystemHealth:   ()       => api.get(`${BASE}/analytics/system-health`).then(r => r.data),
  getRevenue:        ()       => api.get(`${BASE}/analytics/revenue`).then(r => r.data),
  getChurn:          (params) => api.get(`${BASE}/analytics/churn`, { params }).then(r => r.data),

  // ── Security ───────────────────────────────────────────────
  listSecurityPolicies:   ()      => api.get(`${BASE}/security/policies`).then(r => r.data),
  getGlobalPolicy:        ()      => api.get(`${BASE}/security/policies/global`).then(r => r.data),
  getTenantPolicy:        (tid)   => api.get(`${BASE}/security/policies/tenant/${tid}`).then(r => r.data),
  upsertSecurityPolicy:   (data)  => api.put(`${BASE}/security/policies`, data).then(r => r.data),
  forcePasswordReset:     (data)  => api.post(`${BASE}/security/force-password-reset`, data).then(r => r.data),
  bulkPasswordReset:      (data)  => api.post(`${BASE}/security/bulk-password-reset`, data).then(r => r.data),
  getActiveSessions:      ()      => api.get(`${BASE}/security/sessions`).then(r => r.data),
  deactivateUser:         (data)  => api.post(`${BASE}/security/deactivate-user`, data).then(r => r.data),
  reactivateUser:         (data)  => api.post(`${BASE}/security/reactivate-user`, data).then(r => r.data),
  listRateLimits:         ()      => api.get(`${BASE}/security/rate-limits`).then(r => r.data),
  upsertRateLimit:        (data)  => api.put(`${BASE}/security/rate-limits`, data).then(r => r.data),
  deleteRateLimit:        (id)    => api.delete(`${BASE}/security/rate-limits/${id}`).then(r => r.data),
  listDataExports:        (params)=> api.get(`${BASE}/security/data-exports`, { params }).then(r => r.data),
  requestDataExport:      (data)  => api.post(`${BASE}/security/data-exports`, data).then(r => r.data),
  updateExportStatus:     (id, d) => api.put(`${BASE}/security/data-exports/${id}/status`, d).then(r => r.data),
};
