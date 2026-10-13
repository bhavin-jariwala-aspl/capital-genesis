import api from './api';

const BASE = '/insurance';

// ── response unwrap helper ────────────────────────────────────
const data = (r) => r.data;

export const insuranceService = {

  // ── Calculation Engine ───────────────────────────────────────
  getProducts:             ()                           => api.get(`${BASE}/products`).then(r => r.data?.data?.products ?? r.data?.products ?? []),
  getRiders:               (productType)                => api.get(`${BASE}/products/${productType}/riders`).then(r => r.data?.data?.riders ?? r.data?.riders ?? []),
  calculateQuote:          (body)                       => api.post(`${BASE}/calculate-quote`, body).then(r => r.data?.data ?? r.data),
  compareQuotes:           (quotes)                     => api.post(`${BASE}/compare-quotes`, { quotes }).then(data),
  getIllustration:         (body)                       => api.post(`${BASE}/illustration`, body).then(data),
  getRatingAdapters:       ()                           => api.get(`${BASE}/rating-adapters`).then(r => r.data?.data ?? r.data ?? []),
  getCarrierAdapterStatus: (carrierCode)                => api.get(`${BASE}/carriers/${carrierCode}/adapter-status`).then(data),
  updateCarrierAdapterConfig: (carrierCode, config)     => api.put(`${BASE}/carriers/${carrierCode}/adapter-config`, config).then(data),

  // ── Template Engine ──────────────────────────────────────────
  getTemplates:            ()                           => api.get(`${BASE}/templates`).then(data),
  getTemplate:             (templateId)                 => api.get(`${BASE}/templates/${templateId}`).then(data),
  renderTemplate:          (templateId, body)           => api.post(`${BASE}/templates/${templateId}/render`, body).then(data),
  renderQuoteSummary:      (calculation, client, agent) => api.post(`${BASE}/templates/render-quote`, { calculation, client, agent }).then(r => r.data?.data ?? r.data),
  renderIllustration:      (calculation, client)        => api.post(`${BASE}/templates/render-illustration`, { calculation, client }).then(r => r.data?.data ?? r.data),
  renderApplicationForm:   (client, quote)              => api.post(`${BASE}/templates/render-application`, { client, quote }).then(r => r.data?.data ?? r.data),
  renderApplicationReport: (applicationId)              => api.post(`${BASE}/templates/render-application-report`, { application_id: applicationId }).then(r => r.data?.data ?? r.data),
  renderComparisonReport:  (quotes, client)             => api.post(`${BASE}/templates/render-comparison`, { quotes, client }).then(r => r.data?.data ?? r.data),
  renderAndArchive:        (body)                       => api.post(`${BASE}/templates/render-and-archive`, body).then(r => r.data?.data ?? r.data),

  // ── Carriers ─────────────────────────────────────────────────
  listCarriers:            (params)                     => api.get(`${BASE}/carriers`, { params }).then(data),
  getCarrier:              (id)                         => api.get(`${BASE}/carriers/${id}`).then(data),
  createCarrier:           (body)                       => api.post(`${BASE}/carriers`, body).then(data),
  updateCarrier:           (id, body)                   => api.patch(`${BASE}/carriers/${id}`, body).then(data),

  listCarrierProducts:     (params)                     => api.get(`${BASE}/carrier-products`, { params }).then(data),
  createCarrierProduct:    (body)                       => api.post(`${BASE}/carrier-products`, body).then(data),

  // ── Policies ─────────────────────────────────────────────────
  listPolicies:            (params)                     => api.get(`${BASE}/policies`, { params }).then(data),
  getPolicy:               (id)                         => api.get(`${BASE}/policies/${id}`).then(data),
  createPolicy:            (body)                       => api.post(`${BASE}/policies`, body).then(data),
  updatePolicy:            (id, body)                   => api.patch(`${BASE}/policies/${id}`, body).then(data),
  deletePolicy:            (id)                         => api.delete(`${BASE}/policies/${id}`).then(data),
  changePolicyStatus:      (id, status, reason)         => api.post(`${BASE}/policies/${id}/status`, { status, reason }).then(data),
  getBeneficiaries:        (id)                         => api.get(`${BASE}/policies/${id}/beneficiaries`).then(data),
  saveBeneficiaries:       (id, beneficiaries)          => api.put(`${BASE}/policies/${id}/beneficiaries`, { beneficiaries }).then(data),

  // ── Applications ─────────────────────────────────────────────
  listApplications:        (params)                     => api.get(`${BASE}/applications`, { params }).then(data),
  getApplication:          (id)                         => api.get(`${BASE}/applications/${id}`).then(data),
  createApplication:       (body)                       => api.post(`${BASE}/applications`, body).then(data),
  updateApplication:       (id, body)                   => api.patch(`${BASE}/applications/${id}`, body).then(data),
  convertToUnderwriting:   (id, body)                   => api.post(`${BASE}/applications/${id}/convert-underwriting`, body ?? {}).then(data),
  issuePolicy:             (id, body)                   => api.post(`${BASE}/applications/${id}/issue-policy`, body ?? {}).then(data),

  // ── Underwriting ─────────────────────────────────────────────
  listUnderwriting:        (params)                     => api.get(`${BASE}/underwriting`, { params }).then(data),
  getUnderwritingCase:     (id)                         => api.get(`${BASE}/underwriting/${id}`).then(data),
  updateUnderwritingCase:  (id, body)                   => api.patch(`${BASE}/underwriting/${id}`, body).then(data),
  makeUWDecision:          (id, body)                   => api.post(`${BASE}/underwriting/${id}/decision`, body).then(data),
  addRequirement:          (id, body)                   => api.post(`${BASE}/underwriting/${id}/requirements`, body).then(data),
  updateRequirement:       (reqId, body)                => api.patch(`${BASE}/underwriting/requirements/${reqId}`, body).then(data),

  // ── Claims ───────────────────────────────────────────────────
  listClaims:              (params)                     => api.get(`${BASE}/claims`, { params }).then(data),
  getClaim:                (id)                         => api.get(`${BASE}/claims/${id}`).then(data),
  createClaim:             (body)                       => api.post(`${BASE}/claims`, body).then(data),
  updateClaim:             (id, body)                   => api.patch(`${BASE}/claims/${id}`, body).then(data),
  addClaimEvent:           (id, body)                   => api.post(`${BASE}/claims/${id}/events`, body).then(data),

  // ── Commissions ──────────────────────────────────────────────
  listCommissions:         (params)                     => api.get(`${BASE}/commissions`, { params }).then(data),
  getCommissionSummary:    (params)                     => api.get(`${BASE}/commissions/summary`, { params }).then(data),
  createCommission:        (body)                       => api.post(`${BASE}/commissions`, body).then(data),
  updateCommissionStatus:  (id, status, reason)         => api.patch(`${BASE}/commissions/${id}/status`, { status, reason }).then(data),

  // ── P0: Quote Scenarios ──────────────────────────────────────
  listScenarios:           (params)                     => api.get(`${BASE}/quote-scenarios`, { params }).then(data),
  getScenario:             (id)                         => api.get(`${BASE}/quote-scenarios/${id}`).then(data),
  convertScenario:         (id, applicationId)          => api.post(`${BASE}/quote-scenarios/${id}/convert`, { application_id: applicationId }).then(data),

  // ── Declarations ──────────────────────────────────────────
  listDeclarations:          (params)                     => api.get(`${BASE}/declarations`, { params }).then(data),
  getDeclaration:            (id)                         => api.get(`${BASE}/declarations/${id}`).then(data),
  // One record per declaration type, created sequentially (auto-numbering is
  // serialised) — selecting many types can outlast the default 60s timeout,
  // and an aborted request still creates the records server-side.
  sendDeclarations:          (body)                       => api.post(`${BASE}/declarations`, body, { timeout: 300000 }).then(data),
  updateDeclaration:         (id, body)                   => api.patch(`${BASE}/declarations/${id}`, body).then(data),
  resendDeclaration:         (id)                         => api.post(`${BASE}/declarations/${id}/resend`).then(data),

  // ── Application Document Collection ──────────────────────
  listApplicationDocuments:  (params)                     => api.get(`${BASE}/application-documents`, { params }).then(data),
  getApplicationDocument:    (id)                         => api.get(`${BASE}/application-documents/${id}`).then(data),
  uploadApplicationDocuments:(body)                       => api.post(`${BASE}/application-documents`, body).then(data),
  reviewApplicationDocument: (id, body)                   => api.patch(`${BASE}/application-documents/${id}/review`, body).then(data),
  downloadApplicationDocument:(id, opts)                   => api.get(`${BASE}/application-documents/${id}/download`, { responseType: 'blob', params: opts }).then(data),
  previewApplicationDocument: (id, opts)                   => api.get(`${BASE}/application-documents/${id}/preview`, { responseType: 'blob', params: opts }),

  // ── P1: Compliance & Submission ──────────────────────────────
  listCompliance:          (params)                     => api.get(`${BASE}/compliance`, { params }).then(data),
  createCompliance:        (body)                       => api.post(`${BASE}/compliance`, body).then(data),
  updateCompliance:        (id, body)                   => api.patch(`${BASE}/compliance/${id}`, body).then(data),
  getChecklist:            (appId)                      => api.get(`${BASE}/applications/${appId}/checklist`).then(data),
  createChecklist:         (appId, items)               => api.post(`${BASE}/applications/${appId}/checklist`, { items }).then(data),
  updateChecklistItem:     (id, body)                   => api.patch(`${BASE}/checklist/${id}`, body).then(data),
  getSubmissionReadiness:  (appId)                      => api.get(`${BASE}/applications/${appId}/submission-readiness`).then(data),

  // ── P2: Policy Servicing & Billing ───────────────────────────
  listEndorsements:        (params)                     => api.get(`${BASE}/endorsements`, { params }).then(data),
  createEndorsement:       (body)                       => api.post(`${BASE}/endorsements`, body).then(data),
  approveEndorsement:      (id)                         => api.post(`${BASE}/endorsements/${id}/approve`).then(data),
  applyEndorsement:        (id)                         => api.post(`${BASE}/endorsements/${id}/apply`).then(data),
  listRenewalTasks:        (params)                     => api.get(`${BASE}/renewal-tasks`, { params }).then(data),
  createRenewalTask:       (body)                       => api.post(`${BASE}/renewal-tasks`, body).then(data),
  updateRenewalTask:       (id, body)                   => api.patch(`${BASE}/renewal-tasks/${id}`, body).then(data),
  getBilling:              (policyId)                   => api.get(`${BASE}/policies/${policyId}/billing`).then(data),
  createBilling:           (policyId, body)             => api.post(`${BASE}/policies/${policyId}/billing`, body ?? {}).then(data),
  generateInvoice:         (policyId)                   => api.post(`${BASE}/policies/${policyId}/invoices`).then(data),
  recordPayment:           (invoiceId, body)            => api.post(`${BASE}/invoices/${invoiceId}/payments`, body ?? {}).then(data),

  // ── P3: Claims Ops ───────────────────────────────────────────
  setClaimReserve:         (id, body)                   => api.post(`${BASE}/claims/${id}/reserves`, body).then(data),
  recordClaimPayment:      (id, body)                   => api.post(`${BASE}/claims/${id}/payments`, body).then(data),
  flagFraud:               (id, isFraud)                => api.post(`${BASE}/claims/${id}/fraud-flag`, { is_fraud: isFraud }).then(data),
  getAdjusterQueue:        (adjusterId)                 => api.get(`${BASE}/claims/adjuster-queue`, { params: { adjuster_id: adjusterId } }).then(data),

  // ── P4: Producer / Carrier Ops ───────────────────────────────
  listAppointments:        (params)                     => api.get(`${BASE}/producer-appointments`, { params }).then(data),
  createAppointment:       (body)                       => api.post(`${BASE}/producer-appointments`, body).then(data),
  updateAppointment:       (id, body)                   => api.patch(`${BASE}/producer-appointments/${id}`, body).then(data),
  listStatements:          (params)                     => api.get(`${BASE}/commission-statements`, { params }).then(data),
  createStatement:         (body)                       => api.post(`${BASE}/commission-statements`, body).then(data),
  reconcileStatement:      (id)                         => api.post(`${BASE}/commission-statements/${id}/reconcile`).then(data),
  getVarianceReport:       (params)                     => api.get(`${BASE}/commissions/variance-report`, { params }).then(data),

  // ── P5: Agent Workbench ──────────────────────────────────────
  getAgentWorkbench:       (params)                     => api.get(`${BASE}/agent-workbench`, { params }).then(data),

  // ── Feature flags ──────────────────────────────────────────
  isUwWorkflowEnabled:     ()                           => api.get(`${BASE}/feature/underwriting-workflow`).then(r => r.data?.data?.enabled ?? r.data?.enabled ?? false),
};
