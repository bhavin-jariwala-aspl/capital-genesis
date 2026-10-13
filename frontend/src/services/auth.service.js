import api from './api';
import { apiWrapper } from './apiWrapper';

export const authService = {
  login:          (employeeId, password) =>
    apiWrapper.extract(api.post('/auth/login', { employee_id: employeeId, password })),

  mfaVerify:      (mfaToken, code) =>
    apiWrapper.extract(api.post('/auth/mfa/verify', { mfa_token: mfaToken, code })),

  mfaSetup:       (mfaToken = null) =>
    apiWrapper.extract(api.post('/auth/mfa/setup', mfaToken ? { mfa_token: mfaToken } : {})),

  mfaEnable:      (code, mfaToken = null) =>
    apiWrapper.extract(api.post('/auth/mfa/enable', mfaToken ? { code, mfa_token: mfaToken } : { code })),

  mfaDisable:     (code) =>
    apiWrapper.extract(api.post('/auth/mfa/disable', { code })),

  signOutEverywhere: () =>
    apiWrapper.extract(api.post('/auth/logout', { everywhere: true })),

  /** Private iCalendar feed path for the signed-in user (RM-FR-03). */
  calendarSubscription: () =>
    apiWrapper.extract(api.get('/calendar/subscription')),

  me:             () =>
    apiWrapper.extract(api.get('/auth/me')),

  entitlements:   () =>
    apiWrapper.extract(api.get('/auth/entitlements')),

  changePassword: (currentPassword, newPassword) =>
    apiWrapper.extract(api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })),

  forgotPassword: (identifier) =>
    apiWrapper.extract(api.post('/auth/forgot-password', { identifier })),

  resetPassword:  (token, newPassword) =>
    apiWrapper.extract(api.post('/auth/reset-password', { token, new_password: newPassword })),

  getHierarchy:   (id) =>
    apiWrapper.extract(api.get(id ? `/auth/hierarchy/${id}` : '/auth/hierarchy')),

  getEmployees:   () =>
    apiWrapper.extract(api.get('/auth/employees')),

  getOrgHierarchy: () =>
    apiWrapper.extract(api.get('/auth/org-hierarchy')),

  createEmployee: (data) =>
    apiWrapper.extract(api.post('/auth/employees', data)),

  updateEmployee: (id, data) =>
    apiWrapper.extract(api.put(`/auth/employees/${id}`, data)),

  deactivateEmployee: (id) =>
    apiWrapper.extract(api.patch(`/auth/employees/${id}/deactivate`)),

  reactivateEmployee: (id) =>
    apiWrapper.extract(api.patch(`/auth/employees/${id}/reactivate`)),

  getRoles:       () =>
    apiWrapper.extract(api.get('/auth/roles')),

  createRole:     (data) =>
    apiWrapper.extract(api.post('/auth/roles', data)),

  previewRoleShift: (level) =>
    apiWrapper.extract(api.get(`/auth/roles/preview-shift`, { params: { level } })),

  updateRole:     (id, data) =>
    apiWrapper.extract(api.put(`/auth/roles/${id}`, data)),

  deleteRole:     (id) =>
    apiWrapper.extract(api.delete(`/auth/roles/${id}`)),

  getRegions:     () =>
    apiWrapper.extract(api.get('/auth/regions')),

  getBranches:    () =>
    apiWrapper.extract(api.get('/auth/branches')),

  getDirectReports: () =>
    apiWrapper.extract(api.get('/auth/direct-reports')),
};
