import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FolderOpen, RefreshCw, Search, XCircle, Eye, Trash2,
  Upload, Download, File, FileText, Globe, Lock,
  Image, FileSpreadsheet, Plus, HardDrive, UploadCloud, Layers,
  Folder, FolderPlus, Inbox, Files, Share2, Copy, Check, BarChart3,
  PenLine, UserPlus, FileSearch,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import DocumentPreviewModal from '../../components/runtime/DocumentPreviewModal';
import { documentService } from '../../services/document.service';
import { builderService } from '../../services/builder.service';
import { useDocumentPreviewEnabled } from '../../hooks/useDocumentPreviewEnabled';
import { fmtDate, fmtDateTime, formatSize } from '../../utils/formatters';
import { showError, showWarning, confirmDialog, promptDialog } from '../../utils/dialog';

/* ── Category options ──────────────────────────────────────────
 * Sensible defaults for a domain-neutral DMS. In Phase 1 these are
 * replaced by tenant-configured categories from the Document Builder
 * (UiDocumentCategory). Kept here so the standalone module is usable
 * before the builder ships. */
const DEFAULT_CATEGORIES = [
  { value: 'contract',       label: 'Contract' },
  { value: 'identification', label: 'Identification' },
  { value: 'financial',      label: 'Financial' },
  { value: 'correspondence', label: 'Correspondence' },
  { value: 'report',         label: 'Report' },
  { value: 'compliance',     label: 'Compliance' },
  { value: 'other',          label: 'Other' },
];

const MAX_SIZE = 25 * 1024 * 1024;

/* ── Helpers ─────────────────────────────────────────────── */

function mimeIcon(mime) {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.includes('spreadsheet') || mime.includes('excel')) return FileSpreadsheet;
  return FileText;
}

/* ── Upload Modal ─────────────────────────────────────────── */

function UploadModal({ open, onClose, onUpload, categoryOptions }) {
  const [form, setForm] = useState({ category: categoryOptions[0]?.value ?? 'other', description: '' });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFiles = (fileList) => {
    const next = Array.from(fileList).filter(f => {
      if (f.size > MAX_SIZE) { setError(`File "${f.name}" exceeds the 25MB limit.`); return false; }
      return true;
    });
    setFiles(prev => [...prev, ...next]);
    setError('');
  };

  const handleDrop = (e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); };
  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const reset = () => { setForm({ category: categoryOptions[0]?.value ?? 'other', description: '' }); setFiles([]); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (files.length === 0) { setError('Please select at least one file.'); return; }
    setUploading(true); setError('');
    try {
      const encoded = await Promise.all(files.map(file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ filename: file.name, mime_type: file.type, data: reader.result.split(',')[1] });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      await onUpload({ category: form.category, description: form.description, files: encoded });
      reset();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error ?? err?.response?.data?.message ?? err.message ?? 'Upload failed');
    } finally { setUploading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Documents" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
          <select className="input w-full" value={form.category} onChange={e => set('category', e.target.value)}>
            {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
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
            <p className="text-[10px] text-gray-400 mt-1">PDF, JPG, PNG, DOCX, XLSX up to 25MB each</p>
          </div>
          <input ref={fileRef} type="file" className="hidden" multiple
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
            onChange={e => handleFiles(e.target.files)} />
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
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea className="input w-full h-16 resize-none" placeholder="Optional description…" value={form.description} onChange={e => set('description', e.target.value)} />
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

/* ── Detail Modal ─────────────────────────────────────────── */

function DetailModal({ open, onClose, doc, onDownload, onPreview, showPreview, categoryLabel }) {
  if (!doc) return null;
  const FileIcon = mimeIcon(doc.mime_type);
  const rows = [
    ['Reference', doc.document_ref],
    ['Category', categoryLabel(doc.category)],
    ['Size', formatSize(doc.file_size)],
    ['Type', doc.mime_type],
    ['Version', `v${doc.version ?? 1}`],
    ['Status', doc.status],
    ['Linked to', doc.related_to_type ? `${doc.related_to_type} #${doc.related_to_id}` : '—'],
    ['Uploaded by', doc.uploaded_by ?? '—'],
    ['Uploaded', doc.uploaded_at ? fmtDateTime(doc.uploaded_at) : fmtDateTime(doc.created_at)],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Document Details" size="lg">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
            <FileIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{doc.filename}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {doc.is_public
                ? <Badge variant="warning"><Globe className="h-3 w-3 mr-1" />Public</Badge>
                : <Badge variant="default"><Lock className="h-3 w-3 mr-1" />Private</Badge>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {rows.map(([label, val]) => (
            <div key={label}>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{val ?? '—'}</p>
            </div>
          ))}
        </div>

        {doc.description && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{doc.description}</p>
          </div>
        )}

        <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-2">
            {showPreview && (
              <Button variant="secondary" size="sm" onClick={() => onPreview(doc)}>
                <FileSearch className="h-3.5 w-3.5 mr-1" /> Preview
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => onDownload(doc)}>
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Stats Bar ────────────────────────────────────────────── */

function StatsBar({ documents }) {
  const total = documents.length;
  const totalSize = documents.reduce((sum, d) => sum + Number(d.file_size || 0), 0);
  const publicCount = documents.filter(d => d.is_public).length;
  const categories = new Set(documents.map(d => d.category).filter(Boolean)).size;

  const stats = [
    { label: 'Total Documents', value: total, icon: FolderOpen, color: 'text-gray-700 dark:text-gray-200', bg: 'bg-gray-100 dark:bg-white/10' },
    { label: 'Total Size', value: formatSize(totalSize), icon: HardDrive, color: 'text-primary-700 dark:text-primary-400', bg: 'bg-primary-100 dark:bg-primary-500/20' },
    { label: 'Categories', value: categories, icon: Layers, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/20' },
    { label: 'Public', value: publicCount, icon: Globe, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map(stat => {
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

/* ── Share & Analytics Modal ──────────────────────────────── */

function ShareModal({ open, onClose, doc }) {
  const [links, setLinks] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expiresDays, setExpiresDays] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const shareUrl = (token) => `${window.location.origin}/share/${token}`;

  const load = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    try {
      const [l, a] = await Promise.all([
        documentService.listShareLinks(doc.id),
        documentService.getAnalytics(doc.id),
      ]);
      setLinks(l?.data ?? []);
      setAnalytics(a?.data ?? null);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [doc]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const create = async () => {
    setCreating(true);
    try {
      await documentService.createShareLink(doc.id, {
        expires_in_days: expiresDays ? Number(expiresDays) : null,
        allow_download: allowDownload,
      });
      setExpiresDays('');
      load();
    } catch (err) { showError(err?.response?.data?.error ?? 'Could not create link'); }
    finally { setCreating(false); }
  };

  const revoke = async (id) => {
    try { await documentService.revokeShareLink(id); load(); }
    catch { showError('Could not revoke link'); }
  };

  const copy = async (token, id) => {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch { /* clipboard unavailable */ }
  };

  if (!doc) return null;

  return (
    <Modal open={open} onClose={onClose} title="Share & Analytics" size="lg">
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
            <Share2 className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{doc.filename}</p>
        </div>

        {/* Engagement stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Views', value: analytics?.total_views ?? 0, icon: Eye },
            { label: 'Downloads', value: analytics?.total_downloads ?? 0, icon: Download },
            { label: 'Active Links', value: analytics?.active_links ?? 0, icon: Share2 },
          ].map(s => {
            const SIcon = s.icon;
            return (
              <div key={s.label} className="card px-3 py-2 text-center">
                <SIcon className="h-3.5 w-3.5 text-primary-500 mx-auto mb-1" />
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Create link */}
        <div className="rounded-xl border border-gray-100 dark:border-white/[0.07] p-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">New share link</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="block text-[11px] text-gray-500 mb-1">Expires in (days)</label>
              <input type="number" min="1" placeholder="never" className="input w-full" value={expiresDays} onChange={e => setExpiresDays(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-2">
              <input type="checkbox" checked={allowDownload} onChange={e => setAllowDownload(e.target.checked)} /> Allow download
            </label>
            <Button variant="primary" size="sm" className="ml-auto" onClick={create} disabled={creating}>
              <Plus className="h-3.5 w-3.5 mr-1" />{creating ? 'Creating…' : 'Create link'}
            </Button>
          </div>
        </div>

        {/* Existing links */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Links</p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : links.length === 0 ? (
            <p className="text-sm text-gray-400">No share links yet.</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {links.map(link => (
                <div key={link.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${link.is_active ? 'border-gray-100 dark:border-white/[0.07]' : 'border-gray-100 dark:border-white/[0.05] opacity-60'}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate">{shareUrl(link.token)}</p>
                    <p className="text-[10px] text-gray-400">
                      {link.view_count} views
                      {link.expires_at ? ` · expires ${fmtDate(link.expires_at)}` : ' · no expiry'}
                      {!link.allow_download && ' · view-only'}
                      {!link.is_active && ' · revoked'}
                    </p>
                  </div>
                  {link.is_active && (
                    <>
                      <Button variant="ghost" size="xs" onClick={() => copy(link.token, link.id)} title="Copy link">
                        {copiedId === link.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="xs" className="text-red-600 hover:bg-red-50" onClick={() => revoke(link.id)} title="Revoke">
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        {analytics?.recent_events?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Recent activity
            </p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {analytics.recent_events.map(ev => (
                <div key={ev.id} className="flex items-center justify-between text-[11px] text-gray-500 px-2 py-1 rounded bg-gray-50 dark:bg-white/5">
                  <span className="capitalize flex items-center gap-1.5">
                    {ev.event_type === 'download' ? <Download className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {ev.event_type} · {ev.viewer_ip ?? 'unknown'}
                  </span>
                  <span>{fmtDateTime(ev.viewed_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Signature Request Modal ──────────────────────────────── */

const SIG_STATUS_VARIANT = { completed: 'success', declined: 'danger', cancelled: 'default', sent: 'info', pending: 'default', signed: 'success', viewed: 'warning' };

function SignatureModal({ open, onClose, doc }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [ordered, setOrdered] = useState(false);
  const [signers, setSigners] = useState([{ name: '', email: '' }]);
  const [copiedId, setCopiedId] = useState(null);

  const signUrl = (token) => `${window.location.origin}/sign/${token}`;

  const load = useCallback(async () => {
    if (!doc) return;
    setLoading(true);
    try {
      const res = await documentService.listSignatureRequests(doc.id);
      setRequests(res?.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [doc]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const setSigner = (i, k, v) => setSigners(s => s.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const addSigner = () => setSigners(s => [...s, { name: '', email: '' }]);
  const removeSigner = (i) => setSigners(s => s.filter((_, idx) => idx !== i));

  const create = async () => {
    const clean = signers.filter(s => s.name.trim() && s.email.trim());
    if (clean.length === 0) { showWarning('Add at least one signer with a name and email.'); return; }
    setCreating(true);
    try {
      await documentService.createSignatureRequest(doc.id, { title: title || null, ordered, signers: clean });
      setTitle(''); setOrdered(false); setSigners([{ name: '', email: '' }]);
      load();
    } catch (err) { showError(err?.response?.data?.error ?? 'Could not create request'); }
    finally { setCreating(false); }
  };

  const cancel = async (reqId) => {
    if (!(await confirmDialog({
      tone: 'warning',
      title: 'Cancel signature request',
      message: 'Signers can no longer open the request, and any signatures already collected are voided.',
      confirmLabel: 'Cancel request',
      cancelLabel: 'Keep it',
    }))) return;
    try { await documentService.cancelSignatureRequest(reqId); load(); } catch { showError('Could not cancel'); }
  };

  const copy = async (token, id) => {
    try { await navigator.clipboard.writeText(signUrl(token)); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500); } catch { /* noop */ }
  };

  if (!doc) return null;

  return (
    <Modal open={open} onClose={onClose} title="Request Signatures" size="lg">
      <div className="space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
            <PenLine className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          </div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{doc.filename}</p>
        </div>

        {/* New request */}
        <div className="rounded-xl border border-gray-100 dark:border-white/[0.07] p-3 space-y-3">
          <Input label="Title (optional)" placeholder="e.g. NDA countersignature" value={title} onChange={e => setTitle(e.target.value)} />
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Signers</p>
            {signers.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input flex-1" placeholder="Full name" value={s.name} onChange={e => setSigner(i, 'name', e.target.value)} />
                <input className="input flex-1" placeholder="Email" type="email" value={s.email} onChange={e => setSigner(i, 'email', e.target.value)} />
                {signers.length > 1 && (
                  <button onClick={() => removeSigner(i)} className="text-gray-400 hover:text-red-500"><XCircle className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            <button onClick={addSigner} className="text-xs text-primary-600 hover:underline flex items-center gap-1"><UserPlus className="h-3.5 w-3.5" /> Add signer</button>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={ordered} onChange={e => setOrdered(e.target.checked)} /> Sign in order
            </label>
            <Button variant="primary" size="sm" onClick={create} disabled={creating}>
              <PenLine className="h-3.5 w-3.5 mr-1" />{creating ? 'Sending…' : 'Send request'}
            </Button>
          </div>
        </div>

        {/* Existing requests */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Requests</p>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-gray-400">No signature requests yet.</p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {requests.map(rq => (
                <div key={rq.id} className="rounded-lg border border-gray-100 dark:border-white/[0.07] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{rq.title || 'Signature request'}</p>
                      <p className="text-[10px] text-gray-400">{rq.ordered ? 'Ordered' : 'Any order'} · {fmtDate(rq.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={SIG_STATUS_VARIANT[rq.status] ?? 'default'}>{rq.status}</Badge>
                      {['sent'].includes(rq.status) && (
                        <Button variant="ghost" size="xs" className="text-red-600 hover:bg-red-50" onClick={() => cancel(rq.id)} title="Cancel">
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    {(rq.signatories ?? []).map(sg => (
                      <div key={sg.id} className="flex items-center gap-2 text-[11px]">
                        <Badge variant={SIG_STATUS_VARIANT[sg.status] ?? 'default'}>{sg.status}</Badge>
                        <span className="text-gray-600 dark:text-gray-300 truncate flex-1">{sg.name} · {sg.email}</span>
                        {rq.status === 'sent' && sg.status !== 'signed' && sg.status !== 'declined' && (
                          <Button variant="ghost" size="xs" onClick={() => copy(sg.token, sg.id)} title="Copy signing link">
                            {copiedId === sg.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Folder Rail ──────────────────────────────────────────── */

function folderDepth(path) {
  // "/Contracts/2026" → depth 2; top-level "/Contracts" → depth 1.
  return Math.max(0, String(path || '/').split('/').filter(Boolean).length - 1);
}

function FolderRail({ folders, selected, onSelect, onCreate, onDelete }) {
  const RailItem = ({ active, icon: Icon, label, onClick, depth = 0, folder }) => (
    <div
      onClick={onClick}
      style={{ paddingLeft: `${8 + depth * 14}px` }}
      className={`group flex items-center gap-2 pr-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${
        active
          ? 'bg-primary-50 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 font-medium'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {folder && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(folder); }}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
          title="Delete folder"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className="w-56 shrink-0">
      <div className="card px-2 py-2 space-y-0.5">
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Folders</p>
          <button onClick={onCreate} className="text-gray-400 hover:text-primary-500 transition-colors" title="New folder">
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
        <RailItem active={selected === 'all'} icon={Files} label="All Documents" onClick={() => onSelect('all')} />
        <RailItem active={selected === 'unfiled'} icon={Inbox} label="Unfiled" onClick={() => onSelect('unfiled')} />
        {folders.length > 0 && <div className="my-1 border-t border-gray-100 dark:border-white/[0.06]" />}
        {folders.map(f => (
          <RailItem
            key={f.id}
            folder={f}
            active={String(selected) === String(f.id)}
            icon={String(selected) === String(f.id) ? FolderOpen : Folder}
            label={f.name}
            depth={folderDepth(f.path)}
            onClick={() => onSelect(f.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────── */

export default function DocumentsPage() {
  const [categoryOptions, setCategoryOptions] = useState(DEFAULT_CATEGORIES);
  const catLabelMap = useMemo(
    () => Object.fromEntries(categoryOptions.map(c => [c.value, c.label])),
    [categoryOptions],
  );
  const resolveCat = useCallback((v) => catLabelMap[v] ?? (v || '—'), [catLabelMap]);

  const [documents, setDocuments]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm]   = useState('');
  const [detailDoc, setDetailDoc]     = useState(null);
  const [previewDoc, setPreviewDoc]   = useState(null);
  const [showUpload, setShowUpload]   = useState(false);
  const [shareDoc, setShareDoc]       = useState(null);
  const [signDoc, setSignDoc]         = useState(null);
  const showPreview = useDocumentPreviewEnabled();

  // Folder rail. selectedFolder: 'all' | 'unfiled' | <folderId>
  const [folders, setFolders]           = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('all');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await documentService.list({
        ...(categoryFilter && { category: categoryFilter }),
        ...(searchTerm && { search: searchTerm }),
        ...(selectedFolder === 'unfiled' && { folder_id: '' }),
        ...(selectedFolder !== 'all' && selectedFolder !== 'unfiled' && { folder_id: selectedFolder }),
        limit: 200,
      });
      setDocuments(res?.data?.documents ?? res?.documents ?? []);
    } catch (err) {
      setError(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Failed to load documents');
    } finally { setLoading(false); }
  }, [categoryFilter, searchTerm, selectedFolder]);

  useEffect(() => { load(); }, [load]);

  const loadFolders = useCallback(async () => {
    try {
      const res = await documentService.listFolders();
      setFolders(res?.data ?? []);
    } catch { /* folders are optional */ }
  }, []);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  // Load tenant-configured categories from the Document Management builder;
  // fall back to built-in defaults when none are configured.
  useEffect(() => {
    builderService.getDocumentCategories()
      .then(res => {
        const cats = res?.data ?? [];
        if (cats.length) setCategoryOptions(cats.map(c => ({ value: c.code, label: c.label })));
      })
      .catch(() => { /* keep defaults */ });
  }, []);

  // Upload into the currently-selected folder when one is active.
  const activeFolderId = (selectedFolder !== 'all' && selectedFolder !== 'unfiled') ? selectedFolder : null;

  const handleUpload = async ({ category, description, files }) => {
    for (const file of files) {
      await documentService.upload({
        filename:    file.filename,
        mime_type:   file.mime_type,
        data:        file.data,
        category,
        description,
        folder_id:   activeFolderId,
      });
    }
    load();
  };

  const handleCreateFolder = async () => {
    const name = await promptDialog({
      title: 'New folder',
      message: 'Folders group documents for the whole workspace.',
      placeholder: 'Folder name',
      confirmLabel: 'Create folder',
    });
    if (!name || !name.trim()) return;
    try {
      const parent_id = (selectedFolder !== 'all' && selectedFolder !== 'unfiled') ? selectedFolder : null;
      await documentService.createFolder({ name: name.trim(), parent_id });
      loadFolders();
    } catch (err) { showError(err?.response?.data?.error ?? 'Could not create folder'); }
  };

  const handleDeleteFolder = async (folder) => {
    if (!(await confirmDialog({
      title: 'Delete folder',
      message: `“${folder.name}” will be removed. Documents inside it are kept and moved to Unfiled.`,
      confirmLabel: 'Delete folder',
    }))) return;
    try {
      await documentService.deleteFolder(folder.id);
      if (String(selectedFolder) === String(folder.id)) setSelectedFolder('all');
      loadFolders();
    } catch { showError('Could not delete folder'); }
  };

  const handleDownload = useCallback(async (doc) => {
    try {
      const res = await documentService.download(doc.id);
      const blob = res?.data ?? res;
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const a = document.createElement('a');
      a.href = url; a.download = doc.filename ?? 'document'; a.click();
      URL.revokeObjectURL(url);
    } catch { showError('Download failed'); }
  }, []);

  const handleDelete = useCallback(async (doc) => {
    if (!(await confirmDialog({
      title: 'Delete document',
      message: `“${doc.filename}” will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
    }))) return;
    try {
      await documentService.remove(doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch { showError('Delete failed'); }
  }, []);

  const columns = useMemo(() => [
    {
      key: 'filename', label: 'Document', sortable: true,
      render: (_, row) => {
        const Icon = mimeIcon(row.mime_type);
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{row.filename}</p>
              <p className="text-[10px] text-gray-400">{row.document_ref} · {formatSize(row.file_size)}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'category', label: 'Category', sortable: true,
      render: (v) => <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{resolveCat(v)}</span>,
    },
    {
      key: 'related_to_type', label: 'Linked To', sortable: true,
      render: (v, row) => v
        ? <span className="text-xs text-gray-600 dark:text-gray-400">{v} #{row.related_to_id}</span>
        : <span className="text-gray-300 dark:text-gray-600">—</span>,
    },
    {
      key: 'is_public', label: 'Visibility', width: '110px',
      render: (v) => v
        ? <Badge variant="warning"><Globe className="h-3 w-3 mr-1" />Public</Badge>
        : <Badge variant="default"><Lock className="h-3 w-3 mr-1" />Private</Badge>,
    },
    {
      key: 'created_at', label: 'Uploaded', sortable: true,
      render: (v, row) => <span className="text-gray-600 dark:text-gray-400 text-xs">{fmtDate(row.uploaded_at ?? v)}</span>,
    },
    {
      key: '_actions', label: '', width: '120px',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setDetailDoc(row); }} title="View"><Eye className="h-3.5 w-3.5" /></Button>
          {showPreview && (
            <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setPreviewDoc(row); }} title="Preview"><FileSearch className="h-3.5 w-3.5" /></Button>
          )}
          <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); handleDownload(row); }} title="Download"><Download className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setShareDoc(row); }} title="Share & analytics"><Share2 className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setSignDoc(row); }} title="Request signatures"><PenLine className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); handleDelete(row); }} title="Delete" className="text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ], [handleDownload, handleDelete, resolveCat, showPreview]);

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">

        <PageHeader
          icon={FolderOpen}
          eyebrow="Documents"
          title="Document Management"
          subtitle="Central repository for all documents across the organization — upload, organize, and retrieve files from one place."
          className="!mb-0"
          actions={(
            <>
              <Button variant="secondary" size="sm" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
              <Button variant="primary" size="sm" onClick={() => setShowUpload(true)}><Plus className="h-4 w-4" /> Upload Documents</Button>
            </>
          )}
        />

        {!loading && documents.length > 0 && <StatsBar documents={documents} />}

        <div className="flex gap-6 items-start">
          <FolderRail
            folders={folders}
            selected={selectedFolder}
            onSelect={setSelectedFolder}
            onCreate={handleCreateFolder}
            onDelete={handleDeleteFolder}
          />

          <div className="flex-1 min-w-0 space-y-6">
            {/* Filters */}
            <div className="card px-6 py-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[200px] max-w-xs">
                  <Input label="Search" placeholder="Filename, reference, or contents…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} prefix={<Search className="h-3.5 w-3.5" />} />
                </div>
                <div className="w-56">
                  <Select label="Category" placeholder="All Categories" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} options={categoryOptions} />
                </div>
                {(categoryFilter || searchTerm) && (
                  <Button variant="ghost" size="sm" onClick={() => { setCategoryFilter(''); setSearchTerm(''); }}>
                    <XCircle className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>

            {/* Table */}
            <div className="card overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-gray-400">
                  <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading documents…
                </div>
              ) : (
                <DataTable frame={false} data={documents} columns={columns} searchable={false} onRowClick={setDetailDoc}
                  emptyText="No documents here yet. Upload files to get started." />
              )}
            </div>
          </div>
        </div>
      </div>

      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUpload={handleUpload}
        categoryOptions={categoryOptions}
      />
      <DetailModal
        open={!!detailDoc}
        onClose={() => setDetailDoc(null)}
        doc={detailDoc}
        onDownload={handleDownload}
        onPreview={(d) => { setDetailDoc(null); setPreviewDoc(d); }}
        showPreview={showPreview}
        categoryLabel={resolveCat}
      />
      <DocumentPreviewModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        doc={previewDoc}
        fetchBlob={previewDoc ? () => documentService.preview(previewDoc.id) : undefined}
        onDownload={handleDownload}
      />
      <ShareModal
        open={!!shareDoc}
        onClose={() => setShareDoc(null)}
        doc={shareDoc}
      />
      <SignatureModal
        open={!!signDoc}
        onClose={() => setSignDoc(null)}
        doc={signDoc}
      />
    </div>
  );
}
