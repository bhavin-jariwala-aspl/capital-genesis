import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResolvedObject } from '../../hooks/useResolvedObject';
import {
  FolderOpen, RefreshCw, Search, XCircle, Eye, CheckCircle2,
  Clock, Upload, Download, File, FileText,
  Image, FileSpreadsheet, Plus, Shield, UploadCloud, FileSearch,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import DocumentPreviewModal from '../../components/runtime/DocumentPreviewModal';
import { runtimeService } from '../../services/metadata.service';
import { insuranceService } from '../../services/insurance.service';
import { useDocumentPreviewEnabled } from '../../hooks/useDocumentPreviewEnabled';
import { fmtDate, fmtDateTime, formatSize } from '../../utils/formatters';
import { statusVariant, fieldLabel, fieldOptions, optionLabel } from '../../utils/metadata-helpers';
import { showError } from '../../utils/dialog';

/* ── Helpers ─────────────────────────────────────────────── */

function mimeIcon(mime) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return FileSpreadsheet;
  return FileText;
}

/* ── Upload Document Modal ───────────────────────────────── */

function UploadDocumentModal({ open, onClose, applications, onUpload, categoryOptions, defaultApplicationId }) {
  const [form, setForm] = useState({ application_id: defaultApplicationId || '', category: categoryOptions[0]?.value ?? '', notes: '' });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFiles = (fileList) => {
    const newFiles = Array.from(fileList).filter(f => {
      const maxSize = 25 * 1024 * 1024;
      if (f.size > maxSize) { setError(`File "${f.name}" exceeds 25MB limit.`); return false; }
      return true;
    });
    setFiles(prev => [...prev, ...newFiles]);
    setError('');
  };

  const handleDrop = (e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); };
  const handleDragOver = (e) => { e.preventDefault(); setDragActive(true); };
  const handleDragLeave = () => setDragActive(false);
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.application_id) { setError('Please select an application.'); return; }
    if (files.length === 0) { setError('Please select at least one file.'); return; }
    setUploading(true); setError('');
    try {
      const fileData = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ filename: file.name, mime_type: file.type, file_size: file.size, data: reader.result.split(',')[1] });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      await onUpload({ ...form, files: fileData });
      onClose();
      setForm({ application_id: '', category: categoryOptions[0]?.value ?? '', notes: '' });
      setFiles([]);
    } catch (err) {
      setError(err?.response?.data?.message ?? err.message ?? 'Upload failed');
    } finally { setUploading(false); }
  };

  const selectedCategory = categoryOptions.find(c => c.value === form.category);

  return (
    <Modal open={open} onClose={onClose} title="Upload Documents" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Application *</label>
            <select className="input w-full" value={form.application_id} onChange={e => set('application_id', e.target.value)}>
              <option value="">Select application…</option>
              {applications.map(a => (
                <option key={a.id} value={a.id}>
                  {a.app_number} — {a.contact ? `${a.contact.first_name} ${a.contact.last_name}` : 'N/A'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Document Category *</label>
            <select className="input w-full" value={form.category} onChange={e => set('category', e.target.value)}>
              {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {selectedCategory && (
          <div className="rounded-lg border border-blue-100 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-2">
            <p className="text-xs text-blue-700 dark:text-blue-300">{selectedCategory.label}</p>
          </div>
        )}

        {/* Drag & Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
            dragActive
              ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/10'
              : 'border-gray-200 dark:border-white/10 hover:border-primary-300 hover:bg-gray-50 dark:hover:bg-white/5'
          }`}
        >
          <UploadCloud className={`h-8 w-8 ${dragActive ? 'text-primary-500' : 'text-gray-300 dark:text-gray-600'}`} />
          <div className="text-center">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
              {dragActive ? 'Drop files here' : 'Drag & drop files or click to browse'}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">PDF, JPG, PNG, TIFF, DOCX up to 25MB each</p>
          </div>
          <input ref={fileRef} type="file" className="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx,.xls,.xlsx" onChange={e => handleFiles(e.target.files)} />
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{files.length} file(s) selected</p>
            {files.map((file, i) => {
              const Icon = mimeIcon(file.type);
              return (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/[0.07]">
                  <Icon className="h-4 w-4 text-primary-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{file.name}</p>
                    <p className="text-[10px] text-gray-400">{formatSize(file.size)}</p>
                  </div>
                  <button type="button" onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <textarea className="input w-full h-16 resize-none" placeholder="Optional notes…" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" size="sm" disabled={uploading}>
            <Upload className="h-3.5 w-3.5 mr-1" />
            {uploading ? 'Uploading…' : `Upload ${files.length > 0 ? `(${files.length})` : ''}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Document Detail Modal ───────────────────────────────── */

function DocumentDetailModal({ open, onClose, document, onApprove, onReject, onDownload, onPreview, showPreview, fields, statusOptions, categoryOptions }) {
  if (!document) return null;
  const variant = statusVariant(document.status, statusOptions);
  const statusLabel = optionLabel(document.status, statusOptions);
  const catLabel = optionLabel(document.category ?? document.data?.category, categoryOptions);
  const FileIcon = mimeIcon(document.mime_type ?? document.data?.mime_type);

  return (
    <Modal open={open} onClose={onClose} title="Document Details" size="lg">
      <div className="space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
              <FileIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{document.filename ?? document.data?.filename ?? 'Document'}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{catLabel}</p>
            </div>
          </div>
          <Badge variant={variant} dot>{statusLabel}</Badge>
        </div>

        {/* Info Grid — driven by fields metadata */}
        <div className="grid grid-cols-2 gap-4">
          {fields.filter(f => !['notes', 'rejection_reason'].includes(f.name)).map(f => {
            let val = document[f.name] ?? document.data?.[f.name];
            if (val === null || val === undefined) val = '—';
            else if (f.field_type === 'datetime' || f.field_type === 'date') val = fmtDateTime(val);
            else if (f.field_type === 'select') val = optionLabel(val, f.options ?? []);
            else if (f.name === 'file_size') val = formatSize(val);
            return (
              <div key={f.name}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{f.label}</p>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{String(val)}</p>
              </div>
            );
          })}
        </div>

        {/* Image preview */}
        {(document.mime_type ?? document.data?.mime_type)?.startsWith('image/') && document.preview_url && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Preview</p>
            <div className="rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden bg-gray-100 dark:bg-white/5">
              <img src={document.preview_url} alt={document.filename} className="w-full max-h-64 object-contain" />
            </div>
          </div>
        )}

        {/* Rejection reason */}
        {document.status === 'rejected' && (document.rejection_reason || document.data?.rejection_reason) && (
          <div className="rounded-xl border border-red-100 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3">
            <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">{fieldLabel('rejection_reason', fields)}</p>
            <p className="text-sm text-red-700 dark:text-red-300">{document.rejection_reason ?? document.data?.rejection_reason}</p>
          </div>
        )}

        {(document.notes || document.data?.notes) && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{fieldLabel('notes', fields)}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{document.notes ?? document.data?.notes}</p>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-2">
            {showPreview && (
              <Button variant="secondary" size="sm" onClick={() => onPreview(document)}>
                <FileSearch className="h-3.5 w-3.5 mr-1" /> Preview
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => onDownload(document)}>
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            {['uploaded', 'under_review'].includes(document.status) && (
              <>
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => onReject(document)}>
                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                </Button>
                <Button variant="primary" size="sm" onClick={() => onApprove(document)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Rejection Modal ─────────────────────────────────────── */

function RejectModal({ open, onClose, onConfirm, rejectionLabel }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Reject Document" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">Please provide a reason for rejecting this document.</p>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{rejectionLabel} *</label>
          <textarea className="input w-full h-20 resize-none" placeholder="e.g., Document is expired, image is blurry…" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" disabled={!reason.trim()} onClick={() => { onConfirm(reason); setReason(''); }}>Reject Document</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Document Readiness Checklist ─────────────────────────── */

function DocumentChecklist({ documents, categoryOptions: _categoryOptions }) {
  if (!documents || documents.length === 0) return null;
  const byApp = {};
  documents.forEach(d => {
    const key = d.app_number ?? d.application_id ?? 'unknown';
    if (!byApp[key]) byApp[key] = { app_number: d.app_number, applicant: d.applicant_name, docs: [] };
    byApp[key].docs.push(d);
  });
  const apps = Object.values(byApp).slice(0, 5);
  if (apps.length === 0) return null;

  return (
    <div className="card px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="h-4 w-4 text-primary-600" />
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Document Readiness Overview</p>
      </div>
      <div className="space-y-3">
        {apps.map(app => {
          const approved = app.docs.filter(d => d.status === 'approved').length;
          const total = app.docs.length || 1;
          const pct = Math.round((approved / total) * 100);
          return (
            <div key={app.app_number} className="rounded-xl border border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-white/5 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{app.app_number}</span>
                  <span className="text-xs text-gray-500 ml-2">{app.applicant}</span>
                </div>
                <Badge variant={pct === 100 ? 'success' : pct >= 50 ? 'warning' : 'danger'}>
                  {approved}/{total} approved
                </Badge>
              </div>
              <div className="w-full bg-gray-200 dark:bg-white/10 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Stats Bar ───────────────────────────────────────────── */

function StatsBar({ documents, statusOptions }) {
  const total = documents.length;
  const approved = documents.filter(d => d.status === 'approved').length;
  const pending = documents.filter(d => ['required', 'pending', 'uploaded', 'under_review'].includes(d.status)).length;
  const rejected = documents.filter(d => d.status === 'rejected').length;

  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        { label: 'Total Documents', value: total, icon: FolderOpen, color: 'text-gray-700 dark:text-gray-200', bg: 'bg-gray-100 dark:bg-white/10' },
        { label: optionLabel('approved', statusOptions), value: approved, icon: CheckCircle2, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
        { label: 'Pending Review', value: pending, icon: Clock, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
        { label: optionLabel('rejected', statusOptions), value: rejected, icon: XCircle, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-500/20' },
      ].map(stat => {
        const SIcon = stat.icon;
        return (
          <div key={stat.label} className="card px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${stat.bg}`}>
                <SIcon className={`h-3.5 w-3.5 ${stat.color}`} />
              </div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{stat.label}</p>
            </div>
            <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function DocumentCollectionPage() {
  const [searchParams] = useSearchParams();
  const urlApplicationId = searchParams.get('application_id') || '';
  const urlRecordId = searchParams.get('record_id') || '';
  const urlAppNumber = searchParams.get('app_number') || '';

  /* ── Metadata: resolve object + load fields from configured Objects ── */
  const { objectId, fields, resolved } = useResolvedObject('application_document');
  const statusOptions = useMemo(() => fieldOptions('status', fields), [fields]);
  const categoryOptions = useMemo(() => fieldOptions('category', fields), [fields]);

  /* ── Build table columns from metadata (show_in_list fields) ── */
  const listFields = useMemo(() => {
    const marked = fields.filter(f => f.config?.show_in_list === true);
    return marked.length > 0 ? marked : fields.filter(f => !['notes', 'rejection_reason', 'mime_type', 'file_size', 'reviewed_by', 'reviewed_at', 'uploaded_by'].includes(f.name)).slice(0, 6);
  }, [fields]);

  /* ── Data state ── */
  const [documents, setDocuments]       = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm]     = useState('');
  const [detailDoc, setDetailDoc]       = useState(null);
  const [previewDoc, setPreviewDoc]     = useState(null);
  const [showUpload, setShowUpload]     = useState(false);
  const [rejectDoc, setRejectDoc]       = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const showPreview = useDocumentPreviewEnabled();

  const load = useCallback(async () => {
    if (!objectId) return;
    setLoading(true); setError('');
    try {
      const [docRes, appRes] = await Promise.all([
        runtimeService.getRecords(objectId).catch(() => ({ data: [] })),
        insuranceService.listApplications({}).catch(() => ({ data: { applications: [] } })),
      ]);
      let allDocs = docRes?.data ?? [];
      // Flatten: record data lives in record.data; merge for table rendering
      allDocs = allDocs.map(r => ({ ...r, ...(r.data ?? {}) }));
      // Client-side filters (metadata-driven records don't support server-side field filters)
      if (statusFilter)      allDocs = allDocs.filter(d => d.status === statusFilter);
      if (categoryFilter)    allDocs = allDocs.filter(d => d.category === categoryFilter);
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        allDocs = allDocs.filter(d => (d.filename ?? '').toLowerCase().includes(q) || (d.document_number ?? '').toLowerCase().includes(q));
      }
      // Filter by application if URL param present
      const apps = appRes?.data?.applications ?? appRes?.applications ?? [];
      if (urlApplicationId) {
        const app = apps.find(a => String(a.id) === urlApplicationId);
        if (app) allDocs = allDocs.filter(d => d.app_number === app.app_number);
      } else if (urlRecordId) {
        // Wizard passes record_id — find the matching application
        const app = apps.find(a => String(a.record_id) === urlRecordId);
        if (app) allDocs = allDocs.filter(d => d.app_number === app.app_number);
      } else if (urlAppNumber) {
        // Declarations page passes app_number directly
        allDocs = allDocs.filter(d => d.app_number === urlAppNumber);
      }
      setDocuments(allDocs);
      setApplications(apps);
    } catch (err) { setError(err?.response?.data?.message ?? 'Failed to load documents'); }
    finally { setLoading(false); }
  }, [objectId, statusFilter, categoryFilter, searchTerm, urlApplicationId, urlRecordId, urlAppNumber]);

  useEffect(() => { load(); }, [load]);

  // Arriving from the previous process step (Send Declarations) with an
  // application in the URL — open the upload modal for it straight away.
  useEffect(() => {
    if (urlApplicationId) setShowUpload(true);
  }, [urlApplicationId]);

  // Upload: create metadata record via runtime API + store binary via insurance endpoint
  const handleUpload = async (form) => {
    const resolvedData = resolved?.data ?? resolved ?? {};
    const stageId = resolvedData.first_stage_id ?? null;
    const app = applications.find(a => String(a.id) === String(form.application_id));
    const appName = app?.contact
      ? `${app.contact.first_name ?? ''} ${app.contact.last_name ?? ''}`.trim()
      : '';

    for (const file of (form.files ?? [])) {
      // Create metadata-driven record (auto-number generated server-side)
      const record = await runtimeService.createRecord({
        object_id: objectId,
        stage_id:  stageId,
        data: {
          filename:       file.filename,
          category:       form.category ?? 'other',
          applicant_name: appName,
          app_number:     app?.app_number ?? '',
          status:         'uploaded',
          mime_type:      file.mime_type ?? 'application/octet-stream',
          file_size:      String(file.file_size ?? 0),
          uploaded_at:    new Date().toISOString(),
          notes:          form.notes ?? '',
        },
      });
      // Store binary file on disk, keyed by the runtime record ID
      const recordId = record?.data?.id ?? record?.id;
      if (recordId) {
        await insuranceService.uploadApplicationDocuments({
          application_id: form.application_id,
          category: form.category ?? 'other',
          notes: form.notes ?? '',
          record_id: recordId,
          files: [file],
        }).catch(() => {});
      }
    }
    load();
  };

  // Approve: update record status via runtime API
  const handleApprove = useCallback(async (doc) => {
    setActionLoading(true);
    try {
      await runtimeService.updateRecord(doc.id, {
        status:      'approved',
        reviewed_at: new Date().toISOString(),
      });
      load(); setDetailDoc(null);
    } catch (err) { showError(err?.response?.data?.message ?? 'Failed'); }
    finally { setActionLoading(false); }
  }, [load]);

  // Reject: update record status via runtime API
  const handleReject = async (reason) => {
    if (!rejectDoc) return;
    setActionLoading(true);
    try {
      await runtimeService.updateRecord(rejectDoc.id, {
        status:           'rejected',
        reviewed_at:      new Date().toISOString(),
        rejection_reason: reason,
      });
      load(); setRejectDoc(null); setDetailDoc(null);
    } catch (err) { showError(err?.response?.data?.message ?? 'Failed'); }
    finally { setActionLoading(false); }
  };

  // Download: uses record_id to look up binary file via insurance endpoint
  const handleDownload = useCallback(async (doc) => {
    try {
      const res = await insuranceService.downloadApplicationDocument(doc.id, { by_record_id: true });
      const blob = res?.data ?? res;
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const a = document.createElement('a');
      a.href = url; a.download = doc.filename ?? doc.data?.filename ?? 'document'; a.click();
      URL.revokeObjectURL(url);
    } catch { showError('Download failed'); }
  }, []);

  /* ── Columns built dynamically from metadata ── */
  const columns = useMemo(() => {
    const cols = listFields.map(f => ({
      key: f.name, label: f.label, sortable: true,
      render: (v, row) => {
        const val = v ?? row.data?.[f.name];
        if (val === null || val === undefined || val === '') return <span className="text-gray-400">—</span>;

        // Filename with icon
        if (f.name === 'filename') {
          const Icon = mimeIcon(row.mime_type ?? row.data?.mime_type);
          return (
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{val}</p>
                <p className="text-[10px] text-gray-400">{formatSize(row.file_size ?? row.data?.file_size)}</p>
              </div>
            </div>
          );
        }

        // Auto-number
        if (f.config?.auto_number) return <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">{val}</span>;

        // Status field
        if (f.name === 'status') {
          const variant = statusVariant(val, f.options ?? []);
          const label = optionLabel(val, f.options ?? []);
          return <Badge variant={variant} dot>{label}</Badge>;
        }

        // Select fields
        if (f.field_type === 'select') return <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{optionLabel(val, f.options ?? [])}</span>;

        // Date fields
        if (f.field_type === 'datetime' || f.field_type === 'date') return <span className="text-gray-600 dark:text-gray-400 text-xs">{fmtDate(val)}</span>;

        return <span className="text-sm text-gray-700 dark:text-gray-300">{String(val)}</span>;
      },
    }));

    // Actions column
    cols.push({
      key: '_actions', label: '', width: '120px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setDetailDoc(row)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
          {showPreview && (
            <Button variant="ghost" size="xs" onClick={() => setPreviewDoc(row)} title="Preview"><FileSearch className="h-3.5 w-3.5" /></Button>
          )}
          <Button variant="ghost" size="xs" onClick={() => handleDownload(row)} title="Download"><Download className="h-3.5 w-3.5" /></Button>
          {['uploaded', 'under_review'].includes(row.status) && (
            <Button variant="ghost" size="xs" onClick={() => handleApprove(row)} disabled={actionLoading} title="Approve" className="text-emerald-600 hover:bg-emerald-50">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    });

    return cols;
  }, [listFields, actionLoading, handleApprove, handleDownload, showPreview]);

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <PageHeader
          icon={FolderOpen}
          eyebrow="Insurance"
          title="Document Collection"
          subtitle="Capture and manage documents required for application processing, underwriting, and policy issuance."
          className="!mb-0"
          actions={(
            <>
              <Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="primary" size="sm" onClick={() => setShowUpload(true)}><Plus className="h-4 w-4" /> Upload Documents</Button>
            </>
          )}
        />

        {/* Stats */}
        {!loading && documents.length > 0 && <StatsBar documents={documents} statusOptions={statusOptions} />}

        {/* Document Readiness */}
        {!loading && documents.length > 0 && <DocumentChecklist documents={documents} categoryOptions={categoryOptions} />}

        {/* Filters — options from metadata */}
        <div className="card px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px] max-w-xs">
              <Input label="Search" placeholder="Filename, applicant…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
            </div>
            <div className="w-44">
              <Select label={fieldLabel('status', fields) || 'Status'} placeholder="All Statuses" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                options={statusOptions} />
            </div>
            <div className="w-56">
              <Select label={fieldLabel('category', fields) || 'Category'} placeholder="All Categories" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
                options={categoryOptions} />
            </div>
            {(statusFilter || categoryFilter || searchTerm) && (
              <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(''); setCategoryFilter(''); setSearchTerm(''); }}>
                <XCircle className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* Table — columns from metadata */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading documents…
            </div>
          ) : (
            <DataTable frame={false} data={documents} columns={columns} searchable={false} onRowClick={setDetailDoc}
              emptyText="No documents collected yet. Upload documents to get started." />
          )}
        </div>
      </div>

      {/* Modals */}
      <UploadDocumentModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        applications={applications}
        onUpload={handleUpload}
        categoryOptions={categoryOptions.length > 0 ? categoryOptions : [{ value: 'other', label: 'Other' }]}
        defaultApplicationId={urlApplicationId || ''}
      />
      <DocumentDetailModal
        open={!!detailDoc}
        onClose={() => setDetailDoc(null)}
        document={detailDoc}
        onApprove={handleApprove}
        onReject={(doc) => setRejectDoc(doc)}
        onDownload={handleDownload}
        onPreview={(d) => { setDetailDoc(null); setPreviewDoc(d); }}
        showPreview={showPreview}
        fields={fields}
        statusOptions={statusOptions}
        categoryOptions={categoryOptions}
      />
      <DocumentPreviewModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        doc={previewDoc ? {
          filename: previewDoc.filename ?? previewDoc.data?.filename,
          mime_type: previewDoc.mime_type ?? previewDoc.data?.mime_type,
        } : null}
        fetchBlob={previewDoc ? () => insuranceService.previewApplicationDocument(previewDoc.id, { by_record_id: true }) : undefined}
        onDownload={() => previewDoc && handleDownload(previewDoc)}
      />
      <RejectModal
        open={!!rejectDoc}
        onClose={() => setRejectDoc(null)}
        onConfirm={handleReject}
        rejectionLabel={fieldLabel('rejection_reason', fields) || 'Rejection Reason'}
      />
    </div>
  );
}
