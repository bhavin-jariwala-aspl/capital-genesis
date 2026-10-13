import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Download, AlertCircle, ShieldCheck, FileSearch } from 'lucide-react';
import { documentService } from '../services/document.service';
import { formatSize } from '../utils/formatters';
import DocumentPreviewModal from '../components/runtime/DocumentPreviewModal';

/**
 * Public, unauthenticated landing page for a shared document link
 * (/share/:token). Opening the page records a "view" event; the download
 * button records a "download" event — this is the engagement-tracking surface.
 */
export default function SharedDocumentPage() {
  const { token } = useParams();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let alive = true;
    documentService.getPublic(token)
      .then(res => { if (alive) setMeta(res?.data ?? res); })
      .catch(() => { if (alive) setError('This link is invalid, has expired, or was revoked.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [token]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await documentService.downloadPublic(token);
      const blob = res?.data ?? res;
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const a = document.createElement('a');
      a.href = url; a.download = meta?.filename ?? 'document'; a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Download failed or is disabled for this link.'); }
    finally { setDownloading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-night-1 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.08] shadow-xl p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary-500 via-mid to-accent-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <span className="font-bold text-[15px] text-gray-800 dark:text-white">Genesis CRM</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="text-center py-6">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 mb-6">
              <div className="h-12 w-12 rounded-xl bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 break-words">{meta?.filename}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatSize(meta?.file_size)} · {meta?.mime_type}</p>
              </div>
            </div>

            {meta?.allow_preview && (
              <button
                onClick={() => setShowPreview(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary-200 dark:border-primary-500/30 text-primary-600 dark:text-primary-300 hover:bg-primary-50 dark:hover:bg-primary-500/10 font-medium py-2.5 mb-2.5 transition-colors"
              >
                <FileSearch className="h-4 w-4" /> Preview
              </button>
            )}

            {meta?.allow_download ? (
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-on-primary font-medium py-2.5 transition-colors disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {downloading ? 'Preparing…' : 'Download'}
              </button>
            ) : (
              <p className="text-center text-sm text-gray-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Downloading is disabled for this link.
              </p>
            )}

            <p className="text-[11px] text-gray-400 text-center mt-5">
              Shared securely via Genesis CRM Document Management.
            </p>
          </>
        )}
      </div>

      <DocumentPreviewModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        doc={meta}
        src={showPreview ? documentService.publicPreviewUrl(token) : undefined}
        onDownload={meta?.allow_download ? handleDownload : undefined}
        downloading={downloading}
      />
    </div>
  );
}
