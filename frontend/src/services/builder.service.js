import api from './api';

// Helper — returns { data: payload } to match what pages/components expect
const wrap = (promise) => promise.then((r) => ({ data: r.data?.data ?? r.data }));

export const builderService = {
  // Formula language — syntax check as the admin types
  checkFormula:   (expression) => wrap(api.post('/builder/formula/check', { expression })),
  // Public web forms
  publishForm:    (id, settings = {}) => wrap(api.post(`/builder/forms/${id}/publish`, settings)),
  unpublishForm:  (id) => wrap(api.delete(`/builder/forms/${id}/publish`)),

  // Dashboards
  getDashboards:  ()    => wrap(api.get('/builder/dashboards')),
  getDashboard:   (id)  => wrap(api.get(`/builder/dashboards/${id}`)),
  createDashboard:(d)   => wrap(api.post('/builder/dashboards', d)),
  updateDashboard:(id,d)=> wrap(api.put(`/builder/dashboards/${id}`, d)),
  deleteDashboard:(id)  => api.delete(`/builder/dashboards/${id}`),

  // Widgets
  addWidget:          (dashId, d) => wrap(api.post(`/builder/dashboards/${dashId}/widgets`, d)),
  updateWidget:       (id, d)     => wrap(api.put(`/builder/widgets/${id}`, d)),
  deleteWidget:       (id)        => api.delete(`/builder/widgets/${id}`),
  saveWidgetPositions:(positions) => api.put('/builder/widget-positions', { positions }),

  // Charts
  getCharts:       ()    => wrap(api.get('/builder/charts')),
  getChart:        (id)  => wrap(api.get(`/builder/charts/${id}`)),
  createChart:     (d)   => wrap(api.post('/builder/charts', d)),
  updateChart:     (id,d)=> wrap(api.put(`/builder/charts/${id}`, d)),
  deleteChart:     (id)  => api.delete(`/builder/charts/${id}`),

  // Pipelines
  getPipelines:    (objectId) => wrap(api.get('/builder/pipelines', { params: objectId ? { object_id: objectId } : {} })),
  getPipeline:     (id)        => wrap(api.get(`/builder/pipelines/${id}`)),
  createPipeline:  (d)         => wrap(api.post('/builder/pipelines', d)),
  updatePipeline:  (id,d)      => wrap(api.put(`/builder/pipelines/${id}`, d)),
  updatePipelineWithStages: (id,d) => wrap(api.put(`/builder/pipelines/${id}`, d)),
  deletePipeline:  (id)        => api.delete(`/builder/pipelines/${id}`),
  getPipelineAudit: (id)       => wrap(api.get(`/builder/pipelines/${id}/audit`)),

  // Trash — admin recovery of soft-deleted records (Leads, Prospects, etc.)
  getTrashedRecords: (objectId) => wrap(api.get('/builder/trash/records', { params: objectId ? { object_id: objectId } : {} })),
  restoreRecord:     (id)       => wrap(api.post(`/builder/trash/records/${id}/restore`)),
  purgeRecord:       (id)       => api.delete(`/builder/trash/records/${id}`),

  // Workflows
  getWorkflows:    (objectId) => wrap(api.get('/builder/workflows', { params: { object_id: objectId } })),
  getWorkflow:     (id)        => wrap(api.get(`/builder/workflows/${id}`)),
  createWorkflow:  (d)         => wrap(api.post('/builder/workflows', d)),
  updateWorkflow:  (id,d)      => wrap(api.put(`/builder/workflows/${id}`, d)),
  deleteWorkflow:  (id)        => api.delete(`/builder/workflows/${id}`),

  // Workflow steps
  addWorkflowStep:    (wfId, d) => wrap(api.post(`/builder/workflows/${wfId}/steps`, d)),
  updateWorkflowStep: (id, d)   => wrap(api.put(`/builder/workflow-steps/${id}`, d)),
  deleteWorkflowStep: (id)      => api.delete(`/builder/workflow-steps/${id}`),

  // Wizards
  getWizards:      (objectId) => wrap(api.get('/builder/wizards', { params: { object_id: objectId } })),
  getWizard:       (id)        => wrap(api.get(`/builder/wizards/${id}`)),
  createWizard:    (d)         => wrap(api.post('/builder/wizards', d)),
  updateWizard:    (id,d)      => wrap(api.put(`/builder/wizards/${id}`, d)),
  deleteWizard:    (id)        => api.delete(`/builder/wizards/${id}`),

  // Forms (for wizard step picker)
  getForms: () => wrap(api.get('/metadata/forms')),

  // Roles (for "Visible to" dropdown in builder UIs)
  getRoles: () => wrap(api.get('/builder/roles')),
  addWizardStep:       (wizId, d)  => wrap(api.post(`/builder/wizards/${wizId}/steps`, d)),
  updateWizardStep:    (id, d)     => wrap(api.put(`/builder/wizard-steps/${id}`, d)),
  deleteWizardStep:    (id)        => api.delete(`/builder/wizard-steps/${id}`),
  reorderWizardSteps:  (wizId, steps) => api.put(`/builder/wizards/${wizId}/reorder`, { steps }),

  // Assignment rules
  getAssignmentRules:    (objectId)  => wrap(api.get('/builder/assignment-rules', { params: objectId ? { object_id: objectId } : {} })),
  createAssignmentRule:  (d)         => wrap(api.post('/builder/assignment-rules', d)),
  updateAssignmentRule:  (id, d)     => wrap(api.put(`/builder/assignment-rules/${id}`, d)),
  deleteAssignmentRule:  (id)        => api.delete(`/builder/assignment-rules/${id}`),
  getAssignmentLogs:     (filters)   => wrap(api.get('/builder/assignment-logs', { params: filters })),
  // Dry run: who would get this record, and which rule decided. Writes nothing.
  explainAssignment:     (d)         => wrap(api.post('/builder/assignment-rules/explain', d)),

  // Quotas
  getQuotas:  (params) => wrap(api.get('/builder/quotas', { params })),
  setQuota:   (d)      => wrap(api.post('/builder/quotas', d)),
  deleteQuota:(id)     => api.delete(`/builder/quotas/${id}`),

  // Integrations
  getIntegrations:     ()       => wrap(api.get('/builder/integrations')),
  getIntegrationEventCatalog: () => wrap(api.get('/builder/integrations/event-catalog')),
  getIntegration:      (id)     => wrap(api.get(`/builder/integrations/${id}`)),
  createIntegration:   (d)      => wrap(api.post('/builder/integrations', d)),
  updateIntegration:   (id, d)  => wrap(api.put(`/builder/integrations/${id}`, d)),
  deleteIntegration:   (id)     => api.delete(`/builder/integrations/${id}`),
  toggleIntegration:   (id, isActive) => wrap(api.post(`/builder/integrations/${id}/toggle`, { is_active: isActive })),
  testIntegration:     (id, payload)  => wrap(api.post(`/builder/integrations/${id}/test`, payload ?? {})),
  getIntegrationLogs:  (id)     => wrap(api.get(`/builder/integrations/${id}/logs`)),
  getIntegrationStats: (id)     => wrap(api.get(`/builder/integrations/${id}/stats`)),
  retryIntegrationLog: (logId)  => wrap(api.post(`/builder/integrations/logs/${logId}/retry`)),

  // Push Notifications
  getPushNotifications: ()   => wrap(api.get('/builder/push-notifications')),
  sendPushNotification: (d)  => wrap(api.post('/builder/push-notifications', d)),

  // Employees (for push notification target picker)
  getEmployees: () => wrap(api.get('/auth/employees')),

  // Document Management builder — categories
  getDocumentCategories:   (all)   => wrap(api.get('/builder/document-categories', { params: all ? { all: 'true' } : {} })),
  getDocumentCategory:     (id)    => wrap(api.get(`/builder/document-categories/${id}`)),
  createDocumentCategory:  (d)     => wrap(api.post('/builder/document-categories', d)),
  updateDocumentCategory:  (id, d) => wrap(api.put(`/builder/document-categories/${id}`, d)),
  deleteDocumentCategory:  (id)    => api.delete(`/builder/document-categories/${id}`),

  // Document Management builder — checklists
  getDocumentChecklists:   (entityType) => wrap(api.get('/builder/document-checklists', { params: entityType ? { entity_type: entityType } : {} })),
  createDocumentChecklist: (d)     => wrap(api.post('/builder/document-checklists', d)),
  updateDocumentChecklist: (id, d) => wrap(api.put(`/builder/document-checklists/${id}`, d)),
  deleteDocumentChecklist: (id)    => api.delete(`/builder/document-checklists/${id}`),

  // Document Management builder — merge templates
  getDocumentTemplates:    (all)   => wrap(api.get('/builder/document-templates', { params: all ? { all: 'true' } : {} })),
  createDocumentTemplate:  (d)     => wrap(api.post('/builder/document-templates', d)),
  updateDocumentTemplate:  (id, d) => wrap(api.put(`/builder/document-templates/${id}`, d)),
  deleteDocumentTemplate:  (id)    => api.delete(`/builder/document-templates/${id}`),
  previewDocumentTemplate: (id, data) => wrap(api.post(`/documents/templates/${id}/preview`, { data })),
};
