import { useState, useEffect } from 'react';
import { Download, AlertCircle, RefreshCw, FileSearch } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

/**
 * DocumentPreviewModal — renders a document inline so users can view it before
 * downloading. Backed by the document preview endpoints, which return:
 *   - pdf / image  → the original bytes (rendered natively)
 *   - docx / xlsx  → server-converted, sandbox-safe HTML
 *   - text / csv   → plain text
 *   - anything else → a graceful "download to view" notice
 *
 * Two modes:
 *   - Authenticated: pass `fetchBlob` (e.g. () => documentService.preview(id)).
 *     The blob is rendered via an object URL; HTML/text is sandboxed client-side
 *     since a CSP header can't ride along on a blob: URL.
 *   - Public: pass `src` (the public preview URL) — used directly as the iframe
 *     source. The endpoint itself sends `Content-Security-Policy: sandbox`.
 */
export default function DocumentPreviewModal({ open, onClose, doc, fetchBlob, src, onDownload, downloading }) {
  const [url, setUrl] = useState(null);
  const [blobType, setBlobType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !doc) return undefined;

    // Public mode: the endpoint URL is the iframe source directly.
    if (src) {
      setUrl(src);
      setBlobType(String(doc.mime_type || '').toLowerCase());
      setLoading(false);
      setError('');
      return undefined;
    }

    if (!fetchBlob) return undefined;

    // Authenticated mode: fetch the previewable bytes and render via object URL.
    let objectUrl = null;
    let alive = true;
    setLoading(true);
    setError('');
    fetchBlob()
      .then((res) => {
        if (!alive) return;
        const blob = res?.data ?? res;
        const asBlob = blob instanceof Blob ? blob : new Blob([blob]);
        objectUrl = URL.createObjectURL(asBlob);
        setUrl(objectUrl);
        setBlobType((asBlob.type || doc.mime_type || '').toLowerCase());
      })
      .catch(() => { if (alive) setError('Preview isn’t available for this document.'); })
      .finally(() => { if (alive) setLoading(false); });

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, doc, src, fetchBlob]);

  const mime = blobType || String(doc?.mime_type || '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';
  // Sandbox HTML/text so converted or user-supplied markup can't run scripts.
  // Public mode relies on the server's CSP header instead (and PDFs need the
  // browser's viewer, which a strict sandbox would block).
  const iframeSandbox = !src && !isPdf ? '' : undefined;

  const body = (() => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-16 text-gray-500 dark:text-gray-400">
          <AlertCircle className="h-10 w-10 text-amber-400 mb-3" />
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-1 text-gray-400">Try downloading the file to view it.</p>
        </div>
      );
    }
    if (loading || !url) {
      return (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading preview…
        </div>
      );
    }
    if (isImage) {
      return (
        <div className="flex items-center justify-center bg-gray-50 dark:bg-black/20 rounded-lg h-[72vh] overflow-auto">
          <img src={url} alt={doc?.filename ?? 'Preview'} className="max-w-full max-h-full object-contain" />
        </div>
      );
    }
    return (
      <iframe
        src={url}
        title={doc?.filename ?? 'Document preview'}
        sandbox={iframeSandbox}
        className="w-full h-[72vh] rounded-lg border border-gray-100 dark:border-white/[0.08] bg-white"
      />
    );
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={FileSearch}
      eyebrow="Preview"
      title={doc?.filename ?? 'Document'}
      size="full"
      footer={(
        <>
          {onDownload && (
            <Button variant="secondary" size="sm" onClick={() => onDownload(doc)} disabled={downloading}>
              <Download className="h-3.5 w-3.5 mr-1" /> {downloading ? 'Preparing…' : 'Download'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </>
      )}
    >
      {body}
    </Modal>
  );
}
