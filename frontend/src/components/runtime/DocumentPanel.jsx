import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '../../services/document.service';
import {
  FileText, Upload, Download, Trash2, File,
  Image, FileSpreadsheet, Presentation, FileSearch,
} from 'lucide-react';
import clsx from 'clsx';
import DocumentPreviewModal from './DocumentPreviewModal';
import DocumentChecklist from './DocumentChecklist';
import { useDocumentPreviewEnabled } from '../../hooks/useDocumentPreviewEnabled';
import { showError, confirmDialog } from '../../utils/dialog';

// Used only when the workspace has no document categories of its own.
const FALLBACK_CATEGORIES = [
  { value: 'contract',     label: 'Contract' },
  { value: 'proposal',     label: 'Proposal' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'photo',        label: 'Photo' },
  { value: 'other',        label: 'Other' },
];

function mimeIcon(mime) {
  if (!mime) return File;
  if (mime.startsWith('image/'))       return Image;
  if (mime.includes('spreadsheet') || mime.includes('excel'))
    return FileSpreadsheet;
  if (mime.includes('presentation') || mime.includes('powerpoint'))
    return Presentation;
  return FileText;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * DocumentPanel — file attachment panel for the record side panel.
 * Shows all documents attached to a record, with upload and download.
 *
 * @param {number} recordId    – the record to attach documents to
 * @param {string} relatedType – entity type (lead, contact, etc.)
 */
export default function DocumentPanel({ recordId, relatedType, clientEmail, clientName }) {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [category, setCategory] = useState('other');
  // The workspace's own categories (from the checklist call), so staff file a
  // document where the checklist looks for it.
  const [workspaceCategories, setWorkspaceCategories] = useState([]);
  const CATEGORIES = workspaceCategories.length ? workspaceCategories.map((c) => ({ value: c.code, label: c.label })) : FALLBACK_CATEGORIES;
  const [previewDoc, setPreviewDoc] = useState(null);
  const showPreview = useDocumentPreviewEnabled();

  // ── Fetch documents for this record ────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['documents', recordId],
    queryFn:  () => documentService.getForRecord(recordId)
      .then(r => r.data ?? []),
    enabled: !!recordId,
    staleTime: 30_000,
  });
  const documents = data ?? [];

  // ── Upload handler ─────────────────────────────────────────
  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(
          reader.result.split(',')[1]
        );
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await documentService.upload({
        filename:          file.name,
        mime_type:         file.type,
        data:              base64,
        category,
        related_record_id: recordId,
        related_type:      relatedType,
      });

      qc.invalidateQueries({ queryKey: ['documents', recordId] });
      qc.invalidateQueries({ queryKey: ['doc-checklist', recordId] });
      setShowUpload(false);
    } catch (err) {
      showError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [recordId, relatedType, category, qc]);

  // ── Download handler ───────────────────────────────────────
  const handleDownload = useCallback(async (doc) => {
    try {
      const res = await documentService.download(doc.id);
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showError('Download failed');
    }
  }, []);

  // ── Delete ─────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id) => documentService.remove(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['documents', recordId] });
      qc.invalidateQueries({ queryKey: ['doc-checklist', recordId] });
    },
  });

  return (
    <div className="space-y-3">
      <DocumentChecklist recordId={recordId} clientEmail={clientEmail} clientName={clientName}
        onCategories={(cats) => { setWorkspaceCategories(cats); if (cats.length && !cats.some((c) => c.code === category)) setCategory(cats[0].code); }} />
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-white/80">
          Documents
        </h3>
        <button
          onClick={() => setShowUpload(s => !s)}
          className="flex items-center gap-1 text-xs text-primary-600
                     hover:text-primary-700 font-medium"
        >
          <Upload className="w-3.5 h-3.5" />
          {showUpload ? 'Cancel' : 'Upload'}
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="rounded-xl border border-gray-200
                        dark:border-white/10 bg-gray-50
                        dark:bg-white/5 p-3 space-y-2">
          <select
            className="form-input w-full text-xs"
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className={clsx(
            'flex items-center justify-center gap-2 py-3',
            'border-2 border-dashed rounded-lg cursor-pointer',
            'text-xs font-medium transition-colors',
            uploading
              ? 'border-primary-300 text-primary-500 bg-primary-50/50'
              : 'border-gray-200 dark:border-white/10 text-gray-500 hover:border-primary-400',
          )}>
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Choose file'}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </label>
        </div>
      )}

      {/* Document list */}
      {isLoading ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          Loading…
        </p>
      ) : documents.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">
          No documents attached.
        </p>
      ) : (
        <div className="space-y-1.5">
          {documents.map(doc => {
            const Icon = mimeIcon(doc.mime_type);
            return (
              <div
                key={doc.id}
                className="flex items-center gap-2.5 px-3 py-2
                           rounded-lg bg-white dark:bg-white/5
                           border border-gray-100
                           dark:border-white/10 group"
              >
                <Icon className="w-4 h-4 text-primary-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700
                               dark:text-white/80 truncate">
                    {doc.filename}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">
                      {formatSize(doc.file_size)}
                    </span>
                    {doc.category && (
                      <>
                        <span className="text-[10px] text-gray-300">
                          ·
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {doc.category}
                        </span>
                      </>
                    )}
                    <span className="text-[10px] text-gray-300">
                      ·
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {timeAgo(doc.created_at)}
                    </span>
                  </div>
                </div>
                {showPreview && (
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="shrink-0 p-1 rounded text-gray-300
                               hover:text-primary-500 transition-colors
                               opacity-0 group-hover:opacity-100"
                    title="Preview"
                  >
                    <FileSearch className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleDownload(doc)}
                  className="shrink-0 p-1 rounded text-gray-300
                             hover:text-primary-500 transition-colors
                             opacity-0 group-hover:opacity-100"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (await confirmDialog({
                      title: 'Delete document',
                      message: `“${doc.filename}” will be permanently removed.`,
                      confirmLabel: 'Delete',
                    })) deleteMut.mutate(doc.id);
                  }}
                  className="shrink-0 p-1 rounded text-gray-300
                             hover:text-red-500 transition-colors
                             opacity-0 group-hover:opacity-100"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <DocumentPreviewModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        doc={previewDoc}
        fetchBlob={previewDoc ? () => documentService.preview(previewDoc.id) : undefined}
        onDownload={handleDownload}
      />
    </div>
  );
}
