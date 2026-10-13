import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Shield, RefreshCw, CheckCircle2, ThumbsDown, Plus,
  AlertCircle, Clock, FileText, File, Image, FileSpreadsheet,
  Download, User, Heart, DollarSign, ClipboardList,
  Scale, ChevronRight, Check, X, Calendar, FileSearch,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import DocumentPreviewModal from '../../components/runtime/DocumentPreviewModal';
import { insuranceService } from '../../services/insurance.service';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import { useDocumentPreviewEnabled } from '../../hooks/useDocumentPreviewEnabled';
import { fmtCurrency as fmt, fmtDate, fmtDateTime, formatSize } from '../../utils/formatters';
import { statusVariant, fieldOptions, optionLabel, fieldLabel } from '../../utils/metadata-helpers';
import { showError, showWarning } from '../../utils/dialog';

/* ── Fallback configs (used when metadata is unavailable) ── */

const FB_UW_STATUS = [
  { value: 'pending',     label: 'Pending',     color: '#3b82f6' },
  { value: 'in_progress', label: 'In Progress', color: '#8b5cf6' },
  { value: 'approved',    label: 'Approved',    color: '#10b981' },
  { value: 'declined',    label: 'Declined',    color: '#ef4444' },
  { value: 'referred',    label: 'Referred',    color: '#f59e0b' },
];

const FB_DOC_STATUS = [
  { value: 'required',     label: 'Required',     color: '#6b7280' },
  { value: 'pending',      label: 'Pending',      color: '#f59e0b' },
  { value: 'uploaded',     label: 'Uploaded',     color: '#3b82f6' },
  { value: 'under_review', label: 'Under Review', color: '#8b5cf6' },
  { value: 'approved',     label: 'Approved',     color: '#10b981' },
  { value: 'rejected',     label: 'Rejected',     color: '#ef4444' },
  { value: 'waived',       label: 'Waived',       color: '#6b7280' },
];

const FB_APP_STATUS = [
  { value: 'submitted',       label: 'Submitted',       color: '#3b82f6' },
  { value: 'under_review',    label: 'Under Review',    color: '#8b5cf6' },
  { value: 'pending_medical', label: 'Pending Medical', color: '#f59e0b' },
  { value: 'approved',        label: 'Approved',        color: '#10b981' },
  { value: 'declined',        label: 'Declined',        color: '#ef4444' },
  { value: 'withdrawn',       label: 'Withdrawn',       color: '#6b7280' },
  { value: 'issued',          label: 'Issued',          color: '#10b981' },
];

const FB_REQ_STATUS = [
  { value: 'pending',  label: 'Pending',  color: '#f59e0b' },
  { value: 'received', label: 'Received', color: '#3b82f6' },
  { value: 'waived',   label: 'Waived',   color: '#6b7280' },
];

const FB_DECL_STATUS = [
  { value: 'pending',  label: 'Pending',  color: '#f59e0b' },
  { value: 'sent',     label: 'Sent',     color: '#3b82f6' },
  { value: 'viewed',   label: 'Viewed',   color: '#8b5cf6' },
  { value: 'accepted', label: 'Accepted', color: '#10b981' },
  { value: 'signed',   label: 'Signed',   color: '#10b981' },
];

const FB_RISK_CLASSES = [
  { value: 'standard',       label: 'Standard' },
  { value: 'preferred',      label: 'Preferred' },
  { value: 'preferred_plus', label: 'Preferred Plus' },
  { value: 'substandard',    label: 'Substandard' },
  { value: 'rated',          label: 'Table Rated' },
];

const REQ_TYPE_OPTIONS = [
  { value: 'medical_exam',                  label: 'Medical Exam' },
  { value: 'lab_work',                      label: 'Lab Work' },
  { value: 'attending_physician_statement',  label: 'Attending Physician Statement (APS)' },
  { value: 'inspection_report',             label: 'Inspection Report' },
  { value: 'medical_records',               label: 'Medical Records' },
  { value: 'tele_interview',               label: 'Tele-Interview' },
  { value: 'income_verification',           label: 'Income Verification' },
  { value: 'motor_vehicle_report',          label: 'Motor Vehicle Report (MVR)' },
  { value: 'prescription_check',            label: 'Prescription History Check' },
  { value: 'other',                         label: 'Other' },
];

const TABS = [
  { key: 'overview',     label: 'Case Overview',  icon: Shield },
  { key: 'application',  label: 'Application',    icon: ClipboardList },
  { key: 'documents',    label: 'Documents',       icon: FileText },
  { key: 'declarations', label: 'Declarations',    icon: Scale },
  { key: 'requirements', label: 'Requirements',    icon: AlertCircle },
];

/* ── Helpers ─────────────────────────────────────────────── */

function mimeIcon(mime) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return FileSpreadsheet;
  return FileText;
}

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/[0.07]">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-gray-400" />}
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
        </div>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, mono, capitalize }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100 ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>
        {value || '—'}
      </p>
    </div>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
      <Icon className="h-8 w-8 mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

/** Pick first non-empty options array (metadata → fallback) */
function pick(metaOptions, fallback) {
  return metaOptions?.length ? metaOptions : fallback;
}

/* ── Main Page ───────────────────────────────────────────── */

export default function UnderwritingCaseReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  /* ── Metadata loading (MetadataStore → API fallback) ──── */
  const { fields: uwFields }  = useResolvedObject('underwriting_case');
  const { fields: docFields } = useResolvedObject('application_document');
  const { fields: appFields } = useResolvedObject('application');

  const uwStatusOpts    = useMemo(() => pick(fieldOptions('status', uwFields), FB_UW_STATUS), [uwFields]);
  const riskClassOpts   = useMemo(() => pick(fieldOptions('risk_class', uwFields), FB_RISK_CLASSES), [uwFields]);
  const reqTypeOpts     = useMemo(() => pick(fieldOptions('requirement_type', uwFields), REQ_TYPE_OPTIONS), [uwFields]);
  const reqStatusOpts   = useMemo(() => pick(fieldOptions('requirement_status', uwFields), FB_REQ_STATUS), [uwFields]);
  const docStatusOpts   = useMemo(() => pick(fieldOptions('status', docFields), FB_DOC_STATUS), [docFields]);
  const docCategoryOpts = useMemo(() => fieldOptions('category', docFields), [docFields]);
  const appStatusOpts   = useMemo(() => pick(fieldOptions('status', appFields), FB_APP_STATUS), [appFields]);

  /* ── Component state ───────────────────────────────────── */

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const [uwCase, setUwCase]             = useState(null);
  const [application, setApplication]   = useState(null);
  const [documents, setDocuments]       = useState([]);
  const [declarations, setDeclarations] = useState([]);
  const [quoteScenarios, setQuoteScenarios] = useState([]);

  /* Decision modal */
  const [decisionModal, setDecisionModal] = useState(null);
  const [riskClass, setRiskClass]         = useState('standard');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [saving, setSaving]               = useState(false);

  /* Requirement modal */
  const [reqModal, setReqModal]   = useState(false);
  const [reqForm, setReqForm]     = useState({ requirement_type: '', description: '', due_date: '' });
  const [reqSaving, setReqSaving] = useState(false);

  /* Document review modal */
  const [reviewModal, setReviewModal]   = useState(null);
  const [previewDoc, setPreviewDoc]     = useState(null);
  const showPreview = useDocumentPreviewEnabled();
  const [reviewAction, setReviewAction] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  /* Bulk selection */
  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [bulkAction, setBulkAction]     = useState('');
  const [bulkSaving, setBulkSaving]     = useState(false);

  /* ── Data loading ──────────────────────────────────────── */

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const caseRes = await insuranceService.getUnderwritingCase(id);
      const caseData = caseRes?.data ?? caseRes;
      setUwCase(caseData);

      const appId     = caseData?.application?.id ?? caseData?.application_id;
      const appNumber = caseData?.application?.app_number;
      const contactId = caseData?.contact?.id ?? caseData?.application?.contact_id;

      const promises = [];

      if (appId) {
        promises.push(
          insuranceService.getApplication(appId)
            .then(r => setApplication(r?.data ?? r))
            .catch(() => {}),
          insuranceService.listApplicationDocuments({ application_id: appId })
            .then(r => setDocuments(r?.data?.documents ?? r?.documents ?? []))
            .catch(() => setDocuments([])),
        );
      }

      if (appNumber) {
        promises.push(
          insuranceService.listDeclarations({ search: appNumber })
            .then(r => {
              const decls = r?.data?.records ?? r?.records ?? r?.data ?? [];
              setDeclarations(Array.isArray(decls) ? decls : []);
            })
            .catch(() => setDeclarations([])),
        );
      }

      if (contactId) {
        promises.push(
          insuranceService.listScenarios({ contact_id: contactId })
            .then(r => setQuoteScenarios(r?.data?.scenarios ?? r?.scenarios ?? r?.data ?? []))
            .catch(() => setQuoteScenarios([])),
        );
      }

      await Promise.all(promises);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Failed to load case');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* ── Actions ───────────────────────────────────────────── */

  const submitDecision = async () => {
    if (!decisionModal) return;
    setSaving(true);
    try {
      const payload = decisionModal === 'approve'
        ? { status: 'approved', risk_class: riskClass, decision_notes: decisionNotes }
        : { status: 'declined', decision_notes: decisionNotes };
      await insuranceService.makeUWDecision(id, payload);
      setDecisionModal(null);
      setDecisionNotes('');
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Decision failed');
    } finally {
      setSaving(false);
    }
  };

  const submitRequirement = async () => {
    if (!reqForm.requirement_type) { showWarning('Requirement type is required'); return; }
    setReqSaving(true);
    try {
      await insuranceService.addRequirement(id, reqForm);
      setReqModal(false);
      setReqForm({ requirement_type: '', description: '', due_date: '' });
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Failed');
    } finally {
      setReqSaving(false);
    }
  };

  const submitDocReview = async () => {
    if (!reviewModal || !reviewAction) return;
    setReviewSaving(true);
    try {
      await insuranceService.reviewApplicationDocument(reviewModal.id, {
        status: reviewAction,
        rejection_reason: reviewAction === 'rejected' ? reviewReason : undefined,
      });
      setReviewModal(null);
      setReviewAction('');
      setReviewReason('');
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Review failed');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedDocs.size === 0) return;
    setBulkSaving(true);
    try {
      await Promise.all(
        [...selectedDocs].map(docId =>
          insuranceService.reviewApplicationDocument(docId, { status: bulkAction })
        )
      );
      setSelectedDocs(new Set());
      setBulkAction('');
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? err.message ?? 'Bulk action failed');
    } finally {
      setBulkSaving(false);
    }
  };

  const downloadDoc = async (doc) => {
    try {
      const blob = await insuranceService.downloadApplicationDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename || 'document';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      showError('Download failed');
    }
  };

  const updateReqStatus = async (reqId, status) => {
    try {
      await insuranceService.updateRequirement(reqId, { status });
      await load();
    } catch (err) {
      showError(err?.response?.data?.message ?? 'Update failed');
    }
  };

  /* ── Derived data ──────────────────────────────────────── */

  const canDecide = uwCase && (uwCase.status === 'pending' || uwCase.status === 'in_progress');

  const applicantName = useMemo(() => {
    const c = uwCase?.contact ?? application?.contact;
    return c ? `${c.first_name} ${c.last_name}`.trim() : '—';
  }, [uwCase, application]);

  const docStats = useMemo(() => {
    const total = documents.length;
    const approved = documents.filter(d => d.status === 'approved').length;
    const rejected = documents.filter(d => d.status === 'rejected').length;
    const pending  = total - approved - rejected - documents.filter(d => d.status === 'waived').length;
    return { total, approved, rejected, pending };
  }, [documents]);

  const declStats = useMemo(() => {
    const total = declarations.length;
    const accepted = declarations.filter(d => {
      const s = d.field_values?.status ?? d.status;
      return s === 'accepted' || s === 'signed';
    }).length;
    return { total, accepted };
  }, [declarations]);

  const reqStats = useMemo(() => {
    const reqs = uwCase?.requirements ?? [];
    const total = reqs.length;
    const fulfilled = reqs.filter(r => r.status !== 'pending').length;
    return { total, fulfilled, pending: total - fulfilled };
  }, [uwCase]);

  /* ── Loading / Error ───────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading case details…
      </div>
    );
  }

  if (error || !uwCase) {
    return (
      <div className="min-h-full bg-surface px-4 py-8">
        <div className="mx-auto max-w-7xl">
          <Button variant="ghost" size="sm" onClick={() => navigate('/insurance/underwriting')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="mt-8 text-center text-red-500">{error || 'Case not found'}</div>
        </div>
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────── */

  return (
    <div className="min-h-full bg-surface">
      {/* Top bar */}
      <div className="bg-gradient-to-br from-violet-600 to-purple-700 px-4 py-5">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => navigate('/insurance/underwriting')}
              className="flex items-center gap-1 text-sm text-violet-200 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Underwriting
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-violet-300" />
            <span className="text-sm font-mono text-white">{uwCase.case_number}</span>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-white">Case Review</h1>
                <Badge variant={statusVariant(uwCase.status, uwStatusOpts)} dot>
                  {optionLabel(uwCase.status, uwStatusOpts)}
                </Badge>
              </div>
              <p className="text-sm text-violet-100">
                {applicantName} &middot; {optionLabel(uwCase.application?.product_type, fieldOptions('product_type', appFields))} &middot; {fmt(uwCase.application?.coverage_amount)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="glass" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              {canDecide && (
                <>
                  <Button
                    variant="glass"
                    size="sm"
                    className="!bg-emerald-500/20 !text-emerald-100 hover:!bg-emerald-500/30"
                    onClick={() => { setDecisionModal('approve'); setRiskClass('standard'); setDecisionNotes(''); }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button
                    variant="glass"
                    size="sm"
                    className="!bg-red-500/20 !text-red-100 hover:!bg-red-500/30"
                    onClick={() => { setDecisionModal('decline'); setDecisionNotes(''); }}
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" /> Decline
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Summary ribbon */}
          <div className="mt-4 grid grid-cols-4 gap-3">
            {[
              { label: 'Documents', count: `${docStats.approved}/${docStats.total} approved`, ok: docStats.pending === 0 && docStats.total > 0 },
              { label: 'Declarations', count: `${declStats.accepted}/${declStats.total} accepted`, ok: declStats.accepted === declStats.total && declStats.total > 0 },
              { label: 'Requirements', count: reqStats.total === 0 ? 'None' : `${reqStats.fulfilled}/${reqStats.total} fulfilled`, ok: reqStats.pending === 0 },
              { label: fieldLabel('risk_class', uwFields) || 'Risk Class', count: uwCase.risk_class ? optionLabel(uwCase.risk_class, riskClassOpts) : 'Unassigned', ok: !!uwCase.risk_class },
            ].map(item => (
              <div key={item.label} className="rounded-xl bg-white/10 backdrop-blur-sm px-4 py-2.5">
                <p className="text-[11px] font-medium text-violet-200 uppercase tracking-wider">{item.label}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {item.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                    : <Clock className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                  }
                  <span className="text-sm font-semibold text-white capitalize">{item.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-white/[0.07] bg-white dark:bg-night-2 sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4">
          <nav className="flex gap-1 -mb-px">
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              const Icon = tab.icon;
              const badge = tab.key === 'documents' ? docStats.pending : tab.key === 'requirements' ? reqStats.pending : 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {badge > 0 && (
                    <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold dark:bg-amber-500/20 dark:text-amber-400">
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-7xl px-4 py-6 space-y-5">

        {/* ── OVERVIEW TAB ──────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard title="Applicant Information" icon={User}>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label={fieldLabel('applicant_name', appFields) || 'Full Name'} value={applicantName} />
                  <InfoRow label="Email" value={uwCase.contact?.email ?? application?.contact?.email} />
                  <InfoRow label={fieldLabel('age', appFields) || 'Age'} value={uwCase.application?.age ?? application?.age} />
                  <InfoRow label={fieldLabel('gender', appFields) || 'Gender'} value={application?.gender} capitalize />
                  <InfoRow label={fieldLabel('is_smoker', appFields) || 'Smoker'} value={uwCase.application?.is_smoker ? 'Yes' : 'No'} />
                  <InfoRow label={fieldLabel('health_class', appFields) || 'Health Class'} value={application?.health_class} capitalize />
                </div>
              </SectionCard>

              <SectionCard title="Case Details" icon={Shield}>
                <div className="grid grid-cols-2 gap-4">
                  <InfoRow label={fieldLabel('case_number', uwFields) || 'Case Number'} value={uwCase.case_number} mono />
                  <InfoRow label={fieldLabel('app_number', appFields) || 'Application'} value={uwCase.application?.app_number} mono />
                  <InfoRow label={fieldLabel('product_type', appFields) || 'Product'} value={optionLabel(uwCase.application?.product_type, fieldOptions('product_type', appFields))} capitalize />
                  <InfoRow label={fieldLabel('coverage_amount', appFields) || 'Coverage'} value={fmt(uwCase.application?.coverage_amount)} />
                  <InfoRow label={fieldLabel('risk_class', uwFields) || 'Risk Class'} value={uwCase.risk_class ? optionLabel(uwCase.risk_class, riskClassOpts) : 'Unassigned'} capitalize />
                  <InfoRow label={fieldLabel('underwriter', uwFields) || 'Underwriter'} value={uwCase.underwriter_employee?.employee_name ?? 'Unassigned'} />
                  <InfoRow label="Received" value={fmtDate(uwCase.created_at)} />
                  <InfoRow label="Decided" value={fmtDate(uwCase.decided_at)} />
                </div>
              </SectionCard>
            </div>

            {/* Medical Summary */}
            {(uwCase.bmi || uwCase.blood_pressure || uwCase.medical_conditions) && (
              <SectionCard title="Medical Summary" icon={Heart}>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <InfoRow label={fieldLabel('bmi', uwFields) || 'BMI'} value={uwCase.bmi} />
                  <InfoRow label={fieldLabel('blood_pressure', uwFields) || 'Blood Pressure'} value={uwCase.blood_pressure} />
                  <InfoRow label={fieldLabel('cholesterol', uwFields) || 'Cholesterol'} value={uwCase.cholesterol} />
                  <InfoRow label={fieldLabel('medical_conditions', uwFields) || 'Medical Conditions'} value={uwCase.medical_conditions} />
                </div>
                {(uwCase.medications || uwCase.family_history) && (
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.07]">
                    <InfoRow label={fieldLabel('medications', uwFields) || 'Medications'} value={uwCase.medications} />
                    <InfoRow label={fieldLabel('family_history', uwFields) || 'Family History'} value={uwCase.family_history} />
                  </div>
                )}
              </SectionCard>
            )}

            {/* Decision Notes */}
            {uwCase.decision_notes && (
              <SectionCard title={fieldLabel('decision_notes', uwFields) || 'Decision Notes'} icon={ClipboardList}>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{uwCase.decision_notes}</p>
              </SectionCard>
            )}

            {/* Quick status panels */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="card px-5 py-4 cursor-pointer hover:ring-2 hover:ring-violet-200 dark:hover:ring-violet-500/30 transition-all" onClick={() => setActiveTab('documents')}>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Documents</h4>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Approved</span><span className="font-semibold text-emerald-600">{docStats.approved}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Pending Review</span><span className="font-semibold text-amber-600">{docStats.pending}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Rejected</span><span className="font-semibold text-red-600">{docStats.rejected}</span></div>
                </div>
                {docStats.pending > 0 && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <AlertCircle className="h-3.5 w-3.5" /> {docStats.pending} document(s) need review
                  </div>
                )}
              </div>

              <div className="card px-5 py-4 cursor-pointer hover:ring-2 hover:ring-violet-200 dark:hover:ring-violet-500/30 transition-all" onClick={() => setActiveTab('declarations')}>
                <div className="flex items-center gap-2 mb-3">
                  <Scale className="h-4 w-4 text-gray-400" />
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Declarations</h4>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Total</span><span className="font-semibold text-gray-700 dark:text-gray-300">{declStats.total}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Accepted/Signed</span><span className="font-semibold text-emerald-600">{declStats.accepted}</span></div>
                </div>
                {declStats.accepted < declStats.total && declStats.total > 0 && (
                  <div className="mt-3 flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <AlertCircle className="h-3.5 w-3.5" /> {declStats.total - declStats.accepted} declaration(s) outstanding
                  </div>
                )}
              </div>

              <div className="card px-5 py-4 cursor-pointer hover:ring-2 hover:ring-violet-200 dark:hover:ring-violet-500/30 transition-all" onClick={() => setActiveTab('requirements')}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="h-4 w-4 text-gray-400" />
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Requirements</h4>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Total</span><span className="font-semibold text-gray-700 dark:text-gray-300">{reqStats.total}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Fulfilled</span><span className="font-semibold text-emerald-600">{reqStats.fulfilled}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-gray-500">Pending</span><span className="font-semibold text-amber-600">{reqStats.pending}</span></div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── APPLICATION TAB ───────────────────────────────── */}
        {activeTab === 'application' && (
          <>
            {application ? (
              <>
                <SectionCard title="Application Details" icon={ClipboardList}
                  action={
                    <Badge variant={statusVariant(application.status, appStatusOpts)} dot>
                      {optionLabel(application.status, appStatusOpts)}
                    </Badge>
                  }
                >
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoRow label={fieldLabel('app_number', appFields) || 'App Number'} value={application.app_number} mono />
                    <InfoRow label={fieldLabel('product_type', appFields) || 'Product'} value={optionLabel(application.product_type, fieldOptions('product_type', appFields))} capitalize />
                    <InfoRow label={fieldLabel('product_name', appFields) || 'Product Name'} value={application.product_name} />
                    <InfoRow label={fieldLabel('coverage_amount', appFields) || 'Coverage Amount'} value={fmt(application.coverage_amount)} />
                    <InfoRow label={fieldLabel('premium_amount', appFields) || 'Premium Amount'} value={fmt(application.premium_amount)} />
                    <InfoRow label={fieldLabel('payment_frequency', appFields) || 'Payment Frequency'} value={optionLabel(application.payment_frequency, fieldOptions('payment_frequency', appFields))} capitalize />
                    <InfoRow label={fieldLabel('term_years', appFields) || 'Term (Years)'} value={application.term_years} />
                    <InfoRow label="Carrier" value={application.carrier?.name} />
                    <InfoRow label="Agent" value={application.agent?.employee_name} />
                    <InfoRow label={fieldLabel('date_of_birth', appFields) || 'Date of Birth'} value={fmtDate(application.date_of_birth)} />
                    <InfoRow label={fieldLabel('age', appFields) || 'Age'} value={application.age} />
                    <InfoRow label={fieldLabel('gender', appFields) || 'Gender'} value={optionLabel(application.gender, fieldOptions('gender', appFields))} capitalize />
                    <InfoRow label={fieldLabel('is_smoker', appFields) || 'Smoker'} value={application.is_smoker ? 'Yes' : 'No'} />
                    <InfoRow label={fieldLabel('health_class', appFields) || 'Health Class'} value={optionLabel(application.health_class, fieldOptions('health_class', appFields))} capitalize />
                    <InfoRow label={fieldLabel('height_in', appFields) || 'Height'} value={application.height_in ? `${application.height_in}"` : '—'} />
                    <InfoRow label={fieldLabel('weight_lbs', appFields) || 'Weight'} value={application.weight_lbs ? `${application.weight_lbs} lbs` : '—'} />
                    <InfoRow label="Created" value={fmtDate(application.created_at)} />
                  </div>
                  {application.notes && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.07]">
                      <InfoRow label={fieldLabel('notes', appFields) || 'Notes'} value={application.notes} />
                    </div>
                  )}
                </SectionCard>

                {application.contact && (
                  <SectionCard title="Applicant Contact" icon={User}>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      <InfoRow label="Name" value={`${application.contact.first_name} ${application.contact.last_name}`.trim()} />
                      <InfoRow label="Email" value={application.contact.email} />
                      <InfoRow label="Phone" value={application.contact.phone ?? application.contact.mobile_phone} />
                    </div>
                  </SectionCard>
                )}

                {quoteScenarios.length > 0 && (
                  <SectionCard title="Quote Scenarios" icon={DollarSign}>
                    <div className="space-y-2">
                      {quoteScenarios.map((q, i) => (
                        <div key={q.id ?? i} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-white/5 px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">{(q.product_type ?? '').replace(/_/g, ' ')}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {fmt(q.coverage_amount)} &middot; {q.term_years ? `${q.term_years}yr` : ''} &middot; {q.payment_frequency ?? ''} &middot; Premium: {fmt(q.monthly_premium ?? q.annual_premium)}
                            </p>
                          </div>
                          <Badge variant={q.status === 'converted' ? 'success' : q.status === 'active' ? 'info' : 'default'}>
                            {q.status ?? 'draft'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                )}
              </>
            ) : (
              <EmptyState icon={ClipboardList} message="Application details not available" />
            )}
          </>
        )}

        {/* ── DOCUMENTS TAB ─────────────────────────────────── */}
        {activeTab === 'documents' && (
          <>
            {documents.length > 0 && (
              <div className="card px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 dark:border-gray-600"
                        checked={selectedDocs.size > 0 && selectedDocs.size === documents.filter(d => !['approved', 'rejected', 'waived'].includes(d.status)).length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDocs(new Set(documents.filter(d => !['approved', 'rejected', 'waived'].includes(d.status)).map(d => d.id)));
                          } else {
                            setSelectedDocs(new Set());
                          }
                        }}
                      />
                      Select all pending
                    </label>
                    {selectedDocs.size > 0 && (
                      <span className="text-xs font-medium text-violet-600 dark:text-violet-400">{selectedDocs.size} selected</span>
                    )}
                  </div>
                  {selectedDocs.size > 0 && (
                    <div className="flex items-center gap-2">
                      <select className="input text-sm py-1.5 px-3" value={bulkAction} onChange={e => setBulkAction(e.target.value)}>
                        <option value="">Bulk action…</option>
                        <option value="approved">Approve Selected</option>
                        <option value="rejected">Reject Selected</option>
                        <option value="waived">Waive Selected</option>
                      </select>
                      <Button variant="primary" size="sm" onClick={handleBulkAction} disabled={!bulkAction || bulkSaving}>
                        {bulkSaving ? 'Applying…' : 'Apply'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map(doc => {
                  const Icon = mimeIcon(doc.mime_type);
                  const reviewable = !['approved', 'rejected', 'waived'].includes(doc.status);
                  return (
                    <div key={doc.id} className="card px-5 py-4">
                      <div className="flex items-center gap-4">
                        {reviewable ? (
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 dark:border-gray-600 shrink-0"
                            checked={selectedDocs.has(doc.id)}
                            onChange={(e) => {
                              const next = new Set(selectedDocs);
                              e.target.checked ? next.add(doc.id) : next.delete(doc.id);
                              setSelectedDocs(next);
                            }}
                          />
                        ) : <div className="w-4" />}

                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10 shrink-0">
                          <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{doc.original_filename}</p>
                            <Badge variant={statusVariant(doc.status, docStatusOpts)}>
                              {optionLabel(doc.status, docStatusOpts)}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            <span className="font-mono">{doc.document_ref}</span>
                            {doc.category && <> &middot; <span className="capitalize">{docCategoryOpts.length ? optionLabel(doc.category, docCategoryOpts) : doc.category.replace(/_/g, ' ')}</span></>}
                            {doc.file_size && <> &middot; {formatSize(doc.file_size)}</>}
                            {doc.uploaded_at && <> &middot; Uploaded {fmtDate(doc.uploaded_at)}</>}
                            {doc.version > 1 && <> &middot; v{doc.version}</>}
                          </p>
                          {doc.rejection_reason && (
                            <p className="text-xs text-red-500 mt-1">Rejection reason: {doc.rejection_reason}</p>
                          )}
                          {doc.reviewed_at && (
                            <p className="text-xs text-gray-400 mt-0.5">Reviewed {fmtDateTime(doc.reviewed_at)}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {showPreview && (
                            <Button variant="ghost" size="xs" title="Preview" onClick={() => setPreviewDoc(doc)}>
                              <FileSearch className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="xs" title="Download" onClick={() => downloadDoc(doc)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {reviewable && (
                            <>
                              <Button
                                variant="ghost" size="xs" title="Approve"
                                className="text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                                onClick={() => { setReviewModal(doc); setReviewAction('approved'); setReviewReason(''); }}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="xs" title="Reject"
                                className="text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                                onClick={() => { setReviewModal(doc); setReviewAction('rejected'); setReviewReason(''); }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={FileText} message="No documents uploaded for this application" />
            )}
          </>
        )}

        {/* ── DECLARATIONS TAB ──────────────────────────────── */}
        {activeTab === 'declarations' && (
          <>
            {declarations.length > 0 ? (
              <div className="space-y-2">
                {declarations.map((decl, i) => {
                  const fv = decl.field_values ?? {};
                  const status = fv.status ?? decl.status ?? 'pending';
                  return (
                    <div key={decl.id ?? i} className="card px-5 py-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                              {(fv.declaration_type ?? decl.name ?? 'Declaration').replace(/_/g, ' ')}
                            </p>
                            <Badge variant={statusVariant(status, FB_DECL_STATUS)}>
                              {optionLabel(status, FB_DECL_STATUS)}
                            </Badge>
                          </div>
                          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1">
                            {fv.applicant_name && <p className="text-xs text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Applicant:</span> {fv.applicant_name}</p>}
                            {fv.delivery_method && <p className="text-xs text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Delivery:</span> <span className="capitalize">{fv.delivery_method}</span></p>}
                            {fv.sent_at && <p className="text-xs text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Sent:</span> {fmtDateTime(fv.sent_at)}</p>}
                            {fv.accepted_at && <p className="text-xs text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Accepted:</span> {fmtDateTime(fv.accepted_at)}</p>}
                            {fv.signed_by && <p className="text-xs text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">Signed by:</span> {fv.signed_by}</p>}
                            {fv.ip_address && <p className="text-xs text-gray-500"><span className="font-medium text-gray-600 dark:text-gray-400">IP:</span> <span className="font-mono">{fv.ip_address}</span></p>}
                          </div>
                          {fv.notes && <p className="text-xs text-gray-500 mt-1.5">{fv.notes}</p>}
                        </div>
                        {status === 'accepted' || status === 'signed'
                          ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                          : <Clock className="h-5 w-5 text-amber-400 shrink-0" />
                        }
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={Scale} message="No declarations found for this application" />
            )}
          </>
        )}

        {/* ── REQUIREMENTS TAB ──────────────────────────────── */}
        {activeTab === 'requirements' && (
          <>
            <div className="flex justify-end">
              {canDecide && (
                <Button variant="primary" size="sm" onClick={() => setReqModal(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add Requirement
                </Button>
              )}
            </div>

            {(uwCase.requirements ?? []).length > 0 ? (
              <div className="space-y-2">
                {uwCase.requirements.map((req, i) => (
                  <div key={req.id ?? i} className="card px-5 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
                            {optionLabel(req.requirement_type, reqTypeOpts)}
                          </p>
                          <Badge variant={statusVariant(req.status, reqStatusOpts)}>
                            {optionLabel(req.status, reqStatusOpts)}
                          </Badge>
                        </div>
                        {req.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{req.description}</p>}
                        <div className="flex items-center gap-4 mt-1.5">
                          {req.due_date && <p className="text-xs text-gray-400"><Calendar className="h-3 w-3 inline mr-1" />Due {fmtDate(req.due_date)}</p>}
                          {req.received_at && <p className="text-xs text-gray-400">Received {fmtDate(req.received_at)}</p>}
                        </div>
                        {req.notes && <p className="text-xs text-gray-500 mt-1">{req.notes}</p>}
                      </div>
                      {req.status === 'pending' && canDecide && (
                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          <Button
                            variant="ghost" size="xs"
                            className="text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                            title="Mark Received"
                            onClick={() => updateReqStatus(req.id, 'received')}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" /> Received
                          </Button>
                          <Button
                            variant="ghost" size="xs"
                            className="text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                            title="Waive"
                            onClick={() => updateReqStatus(req.id, 'waived')}
                          >
                            Waive
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={AlertCircle} message="No requirements have been added to this case" />
            )}
          </>
        )}
      </div>

      {/* ── DECISION MODAL ──────────────────────────────────── */}
      <Modal
        open={!!decisionModal}
        onClose={() => setDecisionModal(null)}
        title={decisionModal === 'approve' ? 'Approve Case' : 'Decline Case'}
        size="sm"
      >
        {decisionModal && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 px-4 py-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{applicantName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {uwCase.case_number} &middot; {optionLabel(uwCase.application?.product_type, fieldOptions('product_type', appFields))} &middot; {fmt(uwCase.application?.coverage_amount)}
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Readiness Check</p>
              {[
                { label: 'All documents reviewed', ok: docStats.pending === 0 && docStats.total > 0 },
                { label: 'All declarations accepted', ok: declStats.accepted === declStats.total && declStats.total > 0 },
                { label: 'All requirements fulfilled', ok: reqStats.pending === 0 },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  {item.ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    : <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  }
                  <span className={item.ok ? 'text-gray-600 dark:text-gray-400' : 'text-amber-600 dark:text-amber-400 font-medium'}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            {decisionModal === 'approve' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {fieldLabel('risk_class', uwFields) || 'Risk Class'}
                </label>
                <select className="input w-full" value={riskClass} onChange={e => setRiskClass(e.target.value)}>
                  {riskClassOpts.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                {fieldLabel('decision_notes', uwFields) || 'Decision Notes'}
              </label>
              <textarea
                className="input w-full h-20 resize-none"
                placeholder={decisionModal === 'approve' ? 'Approval rationale…' : 'Reason for declining…'}
                value={decisionNotes}
                onChange={e => setDecisionNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
              <Button variant="ghost" size="sm" onClick={() => setDecisionModal(null)}>Cancel</Button>
              <Button
                variant={decisionModal === 'approve' ? 'primary' : 'danger'}
                size="sm"
                onClick={submitDecision}
                disabled={saving}
              >
                {saving ? 'Saving…' : decisionModal === 'approve' ? 'Approve Case' : 'Decline Case'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── DOCUMENT REVIEW MODAL ───────────────────────────── */}
      <Modal
        open={!!reviewModal}
        onClose={() => setReviewModal(null)}
        title={`${reviewAction === 'approved' ? 'Approve' : reviewAction === 'rejected' ? 'Reject' : 'Waive'} Document`}
        size="sm"
      >
        {reviewModal && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 dark:bg-white/5 px-4 py-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{reviewModal.original_filename}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{reviewModal.document_ref}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Action</label>
              <select className="input w-full" value={reviewAction} onChange={e => setReviewAction(e.target.value)}>
                <option value="approved">Approve</option>
                <option value="rejected">Reject</option>
                <option value="waived">Waive</option>
              </select>
            </div>

            {reviewAction === 'rejected' && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {fieldLabel('rejection_reason', docFields) || 'Rejection Reason'} *
                </label>
                <textarea
                  className="input w-full h-16 resize-none"
                  placeholder="Reason for rejection…"
                  value={reviewReason}
                  onChange={e => setReviewReason(e.target.value)}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
              <Button variant="ghost" size="sm" onClick={() => setReviewModal(null)}>Cancel</Button>
              <Button
                variant={reviewAction === 'rejected' ? 'danger' : 'primary'}
                size="sm"
                onClick={submitDocReview}
                disabled={reviewSaving || (reviewAction === 'rejected' && !reviewReason)}
              >
                {reviewSaving ? 'Saving…' : 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── ADD REQUIREMENT MODAL ───────────────────────────── */}
      <Modal open={reqModal} onClose={() => setReqModal(false)} title="Add Requirement" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {fieldLabel('requirement_type', uwFields) || 'Requirement Type'} *
            </label>
            <select
              className="input w-full"
              value={reqForm.requirement_type}
              onChange={e => setReqForm(f => ({ ...f, requirement_type: e.target.value }))}
            >
              <option value="">Select type…</option>
              {reqTypeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              className="input w-full h-16 resize-none"
              placeholder="Details…"
              value={reqForm.description}
              onChange={e => setReqForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Due Date</label>
            <input
              type="date"
              className="input w-full"
              value={reqForm.due_date}
              onChange={e => setReqForm(f => ({ ...f, due_date: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
            <Button variant="ghost" size="sm" onClick={() => setReqModal(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={submitRequirement} disabled={reqSaving}>
              {reqSaving ? 'Saving…' : 'Add Requirement'}
            </Button>
          </div>
        </div>
      </Modal>

      <DocumentPreviewModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        doc={previewDoc ? { filename: previewDoc.original_filename, mime_type: previewDoc.mime_type } : null}
        fetchBlob={previewDoc ? () => insuranceService.previewApplicationDocument(previewDoc.id) : undefined}
        onDownload={() => previewDoc && downloadDoc(previewDoc)}
      />
    </div>
  );
}
