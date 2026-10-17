import api from './api';
import { apiWrapper } from './apiWrapper';

const { wrap, delete: del } = apiWrapper;

export const metadataService = {
  // Modules
  getModules:  ()       => wrap(api.get('/metadata/modules')),
  getModule:   (id)     => wrap(api.get(`/metadata/modules/${id}`)),
  createModule:(data)   => wrap(api.post('/metadata/modules', data)),
  updateModule:(id, d)  => wrap(api.put(`/metadata/modules/${id}`, d)),
  deleteModule:(id)     => del(api.delete(`/metadata/modules/${id}`)),

  // Objects
  getObjects:  (moduleId) => wrap(api.get('/metadata/objects', { params: { module_id: moduleId } })),
  getObject:   (id)       => wrap(api.get(`/metadata/objects/${id}`)),
  createObject:(data)     => wrap(api.post('/metadata/objects', data)),
  updateObject:(id, d)    => wrap(api.put(`/metadata/objects/${id}`, d)),
  deleteObject:(id)       => del(api.delete(`/metadata/objects/${id}`)),

  // Fields
  getFields:   (objectId) => wrap(api.get('/metadata/fields', { params: { object_id: objectId } })),
  getField:    (id)       => wrap(api.get(`/metadata/fields/${id}`)),
  createField: (data)     => wrap(api.post('/metadata/fields', data)),
  updateField: (id, d)    => wrap(api.put(`/metadata/fields/${id}`, d)),
  deleteField: (id)       => del(api.delete(`/metadata/fields/${id}`)),

  // Forms
  getForms:    (objectId) => wrap(api.get('/metadata/forms', { params: { object_id: objectId } })),
  getForm:     (id)       => wrap(api.get(`/metadata/forms/${id}`)),
  getFormFull: (id)       => wrap(api.get(`/runtime/form/${id}`)),  // full form with fields+deps+funcs
  createForm:  (data)     => wrap(api.post('/metadata/forms', data)),
  updateForm:  (id, d)    => wrap(api.put(`/metadata/forms/${id}`, d)),
  deleteForm:  (id)       => del(api.delete(`/metadata/forms/${id}`)),
  saveFormLayout: (id, layouts) => api.put(`/metadata/forms/${id}/layout`, { layouts }),

  // Validations
  getValidations:   (fieldId) => wrap(api.get('/metadata/validations', { params: { field_id: fieldId } })),
  createValidation: (data)    => wrap(api.post('/metadata/validations', data)),
  updateValidation: (id, d)   => wrap(api.put(`/metadata/validations/${id}`, d)),
  deleteValidation: (id)      => del(api.delete(`/metadata/validations/${id}`)),

  // Dependencies
  getDependencies:    (fieldId) => wrap(api.get('/metadata/dependencies', { params: { field_id: fieldId } })),
  getDepsForForm:     (formId)  => wrap(api.get('/metadata/dependencies', { params: { form_id: formId } })),
  createDependency:   (data)    => wrap(api.post('/metadata/dependencies', data)),
  updateDependency:   (id, d)   => wrap(api.put(`/metadata/dependencies/${id}`, d)),
  deleteDependency:   (id)      => del(api.delete(`/metadata/dependencies/${id}`)),
};

export const runtimeService = {
  // Bootstrap — single call loads all metadata for local cache
  bootstrap:    ()   => wrap(api.get('/runtime/bootstrap')),

  getModules:   ()   => wrap(api.get('/runtime/modules')),
  getModule:    (id) => wrap(api.get(`/runtime/module/${id}`)),
  getObject:    (id) => wrap(api.get(`/runtime/object/${id}`)),
  getForm:      (id) => wrap(api.get(`/runtime/form/${id}`)),
  getDashboard: (id) => wrap(api.get(`/runtime/dashboard/${id}`)),
  getDashboards: ()  => wrap(api.get('/runtime/dashboards')),
  getWizards:   (objectId) => wrap(api.get('/runtime/wizards', { params: objectId ? { object_id: objectId } : {} })),
  getWizard:    (id) => wrap(api.get(`/runtime/wizard/${id}`)),
  getPipeline:  (id) => wrap(api.get(`/runtime/pipeline/${id}`)),

  // Resolve object IDs by name (avoids hardcoding auto-increment IDs)
  resolveObject: (name) => wrap(api.get('/runtime/resolve', { params: { object: name } })),

  // Records
  getRecords:        (objectId)         => wrap(api.get('/runtime/records', { params: { object_id: objectId } })),
  getRecord:         (id)               => wrap(api.get(`/runtime/records/${id}`)),
  createRecord:      (data)             => wrap(api.post('/runtime/records', data)),
  updateRecord:      (id, data)         => wrap(api.put(`/runtime/records/${id}`, { data })),
  updateRecordStage: (id, stageId)      => wrap(api.patch(`/runtime/records/${id}/stage`, { stage_id: stageId })),
  deleteRecord:      (id)               => del(api.delete(`/runtime/records/${id}`)),

  // Bulk operations
  bulkDeleteRecords:      (ids)              => wrap(api.post('/runtime/records/bulk-delete', { ids })),
  bulkAssignRecords:      (ids, assigned_to) => wrap(api.post('/runtime/records/bulk-assign', { ids, assigned_to })),
  mergeRecord:            (id, into)         => wrap(api.post(`/runtime/records/${id}/merge`, { into })),
  unmergeRecord:          (id)               => wrap(api.post(`/runtime/records/${id}/unmerge`)),
  bulkUpdateRecordStage:  (ids, stageId)     => wrap(api.post('/runtime/records/bulk-stage', { ids, stage_id: stageId })),

  // Export (returns blob)
  exportRecordsCsv: (objectId) =>
    apiWrapper.blob(api.get('/runtime/records/export', {
      params:       { object_id: objectId },
      responseType: 'blob',
    })),

  // Audit trail
  getRecordAudit: (id) => wrap(api.get(`/runtime/records/${id}/audit`)),

  // Lookups, related lists and record actions
  getRelated:       (id)               => wrap(api.get(`/runtime/records/${id}/related`)),
  getApprovals:     (scope = 'mine')   => wrap(api.get('/runtime/workflows/approvals', { params: { scope } })),
  decideApproval:   (token, action, comment) => wrap(api.post(`/runtime/workflows/approval/${token}`, { action, ...(comment ? { comment } : {}) })),
  revealField:      (id, field)        => wrap(api.post(`/runtime/records/${id}/reveal`, { field })),
  searchLookup:     (objectName, q, id) => wrap(api.get(`/runtime/lookup/${encodeURIComponent(objectName)}`, { params: id ? { id } : { q } })),
  getObjectActions: (objectId)         => wrap(api.get(`/runtime/objects/${objectId}/actions`)),
  runRecordAction:  (id, workflowId, values) => wrap(api.post(`/runtime/records/${id}/actions/${workflowId}`, values ? { values } : {})),

  // Lead conversion (accepts record ID, not CRM lead ID)
  convertLead: (recordId, options = {}) => wrap(api.post(`/runtime/records/${recordId}/convert-lead`, options)),

  // Raw Lead → Prospect conversion (accepts record ID)
  convertToProspect: (recordId, options = {}) => wrap(api.post(`/runtime/records/${recordId}/convert-to-prospect`, options)),

  // Products
  getProducts:    ()         => wrap(api.get('/runtime/products')),
  getProduct:     (id)       => wrap(api.get(`/runtime/products/${id}`)),
  createProduct:  (data)     => wrap(api.post('/runtime/products', data)),
  updateProduct:  (id, data) => wrap(api.put(`/runtime/products/${id}`, data)),
  deleteProduct:  (id)       => del(api.delete(`/runtime/products/${id}`)),
};
