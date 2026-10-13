import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize,
  Minimize,
  Printer,
  Download,
  Mail,
  Send,
  X,
  FileText,
  PanelLeftClose,
  PanelLeft,
  File,
  Image,
  Trash2,
  Check,
  AlertCircle,
  ChevronDown,
  Paperclip,
  List,
  Columns,
} from 'lucide-react';
import api from '../../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200];
const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fileIcon(file) {
  if (file.type?.startsWith('image/')) return Image;
  return File;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAcceptedFile(file) {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function extractHeadings(html) {
  if (!html) return [];
  const headings = [];
  const regex = /<(h[1-3])[^>]*(?:id="([^"]*)")?[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  let index = 0;
  while ((match = regex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const id = match[2] || `heading-${index}`;
    const text = match[3].replace(/<[^>]*>/g, '').trim();
    if (text) {
      headings.push({
        id,
        tag,
        text,
        level: parseInt(tag.charAt(1), 10),
        index,
      });
      index++;
    }
  }
  return headings;
}

function injectHeadingIds(html, headings) {
  if (!html || headings.length === 0) return html;
  let result = html;
  let idx = 0;
  result = result.replace(/<(h[1-3])([^>]*)>([\s\S]*?)<\/\1>/gi, (full, tag, attrs, inner) => {
    const heading = headings[idx];
    if (heading && !attrs.includes('id=')) {
      idx++;
      return `<${tag}${attrs} id="${heading.id}">${inner}</${tag}>`;
    }
    idx++;
    return full;
  });
  return result;
}

// ─── Droppable Zone ──────────────────────────────────────────────────────────

function DropZone({ children, onFileDrop }) {
  const [nativeDragOver, setNativeDragOver] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setNativeDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setNativeDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setNativeDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    const valid = files.filter(isAcceptedFile);
    if (valid.length > 0) {
      onFileDrop(valid);
    }
  }, [onFileDrop]);

  const showOverlay = nativeDragOver;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative flex-1 min-h-0"
    >
      {children}
      {showOverlay && (
        <div className="absolute inset-0 z-30 flex items-center justify-center
                        bg-primary-500/10 dark:bg-primary-400/10
                        border-2 border-dashed border-primary-400 dark:border-primary-500
                        rounded-lg backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary-600 dark:text-primary-400">
            <Download className="w-10 h-10" />
            <p className="text-sm font-semibold">Drop files here</p>
            <p className="text-xs text-primary-500/70 dark:text-primary-400/60">
              PDF, PNG, JPG accepted
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Email Modal ─────────────────────────────────────────────────────────────

/**
 * DocumentEmailModal — sends the current HTML document as a real PDF attachment.
 *
 * Uses POST /api/email/send-with-pdf which converts the HTML to PDF via Chrome
 * headless on the backend. Falls back to HTML inline if Chrome unavailable.
 *
 * @param {boolean}  open
 * @param {function} onClose
 * @param {string}   title           – document title (pre-fills subject)
 * @param {string}   htmlContent     – raw HTML from the document viewer
 * @param {string}   clientEmail     – pre-fills the To field
 * @param {function} onEmailSent     – callback after successful send
 */
/** Read a File as a base64-encoded data string (without the data: prefix). */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function DocumentEmailModal({
  open,
  onClose,
  title,
  htmlContent,
  clientEmail,
  droppedFiles,
  onEmailSent,
}) {
  const [toEmail, setToEmail] = useState(clientEmail || '');
  const [ccEmails, setCcEmails] = useState('');
  const [bccEmails, setBccEmails] = useState('');
  const [subject, setSubject] = useState(title ? `Document: ${title}` : '');
  const [body, setBody] = useState(
    'Dear Client,\n\nPlease find the attached document for your review. ' +
    'If you have any questions or require further information, please do not hesitate to reach out.\n\n' +
    'Best regards'
  );
  const [sendResult, setSendResult] = useState(null);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setToEmail(clientEmail || '');
      setSubject(title ? `Document: ${title}` : '');
      setSendResult(null);
    }
  }, [open, clientEmail, title]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const ccArr  = ccEmails.split(',').map(s => s.trim()).filter(Boolean);
      const bccArr = bccEmails.split(',').map(s => s.trim()).filter(Boolean);

      // Convert any drag-dropped files to base64 for the backend
      const extraAttachments = droppedFiles?.length
        ? await Promise.all(
            droppedFiles.map(async (file) => ({
              filename:       file.name,
              content_base64: await readFileAsBase64(file),
              content_type:   file.type || 'application/octet-stream',
            }))
          )
        : [];

      // Use send-with-pdf — backend converts htmlContent to a real PDF attachment via Chrome
      return api.post('/email/send-with-pdf', {
        to_email:          toEmail,
        cc_emails:         ccArr.length  ? ccArr  : undefined,
        bcc_emails:        bccArr.length ? bccArr : undefined,
        subject,
        body_text:         body,
        pdf_html:          htmlContent,
        pdf_filename:      `${title || 'document'}.pdf`,
        extra_attachments: extraAttachments.length ? extraAttachments : undefined,
      });
    },
    onSuccess: (res) => {
      const attached = res?.data?.data?.pdf_attached ?? res?.data?.pdf_attached;
      const msg = attached
        ? 'Email sent with PDF attachment!'
        : 'Email sent (HTML inline — PDF generation unavailable on this server).';
      setSendResult({ success: true, message: msg });
      onEmailSent?.();
      closeTimerRef.current = setTimeout(() => onClose?.(), 2000);
    },
    onError: (err) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to send email';
      setSendResult({ success: false, message: msg });
    },
  });

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSend = toEmail.trim() && isValidEmail(toEmail) && subject.trim() && !!htmlContent;

  if (!open || typeof document === 'undefined') return null;

  // Portal to <body> so the fixed scrim maps to the viewport (covers header/sidebar).
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in motion-reduce:animate-none">
      <div className="absolute inset-0 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-lg max-h-[92vh] bg-white dark:bg-night-2
                      border border-gray-200/70 dark:border-white/[0.08]
                      rounded-t-3xl sm:rounded-3xl shadow-elevated flex flex-col overflow-hidden
                      animate-slide-up motion-reduce:animate-none">
        {/* Brand accent ribbon */}
        <div className="modal-accent" />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4
                        border-b border-gray-200 dark:border-white/10 aurora-wash">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-violet-500" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Email Document
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600
                       dark:hover:text-white/60 hover:bg-gray-100
                       dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {sendResult && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
              sendResult.success
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
            }`}>
              {sendResult.success
                ? <Check className="w-4 h-4" />
                : <AlertCircle className="w-4 h-4" />}
              {sendResult.message}
            </div>
          )}

          {/* To */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">
              To *
            </label>
            <input
              type="email"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                         dark:border-white/10 bg-white dark:bg-white/5
                         text-gray-800 dark:text-white/90
                         focus:outline-none focus:ring-2 focus:ring-primary-500/40
                         placeholder:text-gray-400 dark:placeholder:text-white/30"
              placeholder="recipient@example.com"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
            />
            {toEmail && !isValidEmail(toEmail) && (
              <p className="mt-1 text-xs text-red-500">Please enter a valid email address</p>
            )}
          </div>

          {/* CC / BCC */}
          <details className="group">
            <summary className="text-xs text-primary-600 dark:text-primary-400 cursor-pointer
                               font-medium flex items-center gap-1">
              <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
              CC / BCC
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">
                  CC
                </label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                             dark:border-white/10 bg-white dark:bg-white/5
                             text-gray-800 dark:text-white/90
                             focus:outline-none focus:ring-2 focus:ring-primary-500/40
                             placeholder:text-gray-400 dark:placeholder:text-white/30"
                  placeholder="Comma-separated emails"
                  value={ccEmails}
                  onChange={(e) => setCcEmails(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">
                  BCC
                </label>
                <input
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                             dark:border-white/10 bg-white dark:bg-white/5
                             text-gray-800 dark:text-white/90
                             focus:outline-none focus:ring-2 focus:ring-primary-500/40
                             placeholder:text-gray-400 dark:placeholder:text-white/30"
                  placeholder="Comma-separated emails"
                  value={bccEmails}
                  onChange={(e) => setBccEmails(e.target.value)}
                />
              </div>
            </div>
          </details>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">
              Subject *
            </label>
            <input
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                         dark:border-white/10 bg-white dark:bg-white/5
                         text-gray-800 dark:text-white/90
                         focus:outline-none focus:ring-2 focus:ring-primary-500/40
                         placeholder:text-gray-400 dark:placeholder:text-white/30"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">
              Message
            </label>
            <textarea
              rows={5}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200
                         dark:border-white/10 bg-white dark:bg-white/5
                         text-gray-800 dark:text-white/90 resize-none
                         focus:outline-none focus:ring-2 focus:ring-primary-500/40
                         placeholder:text-gray-400 dark:placeholder:text-white/30"
              placeholder="Your message..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* PDF attachment indicator */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-50 dark:bg-primary-500/10 text-xs text-primary-700 dark:text-primary-300">
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span>
              <strong>{title || 'Document'}.pdf</strong> will be attached as a PDF file.
            </span>
          </div>

          {/* Drag-dropped extra attachments */}
          {droppedFiles?.length > 0 && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <Paperclip className="w-3.5 h-3.5" />
                {droppedFiles.length} additional file{droppedFiles.length > 1 ? 's' : ''} attached
              </div>
              {droppedFiles.map((f, i) => (
                <div key={i} className="pl-5 truncate text-amber-600 dark:text-amber-400">{f.name}</div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4
                        border-t border-gray-200 dark:border-white/10
                        bg-gray-50 dark:bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-white/60
                       hover:text-gray-800 dark:hover:text-white/80 rounded-lg
                       hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium
                       text-white bg-primary-600 hover:bg-primary-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       rounded-lg transition-colors"
          >
            {sendMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white
                              rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendMutation.isPending ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function ViewerSidebar({
  headings,
  droppedFiles,
  onRemoveFile,
  onHeadingClick,
  activeTab,
  onTabChange,
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Sidebar tabs */}
      <div className="flex border-b border-gray-200 dark:border-white/10">
        <button
          onClick={() => onTabChange('outline')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5
                      text-xs font-medium transition-colors ${
            activeTab === 'outline'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
              : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
          }`}
        >
          <List className="w-3.5 h-3.5" />
          Outline
        </button>
        <button
          onClick={() => onTabChange('files')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5
                      text-xs font-medium transition-colors ${
            activeTab === 'files'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
              : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
          }`}
        >
          <Paperclip className="w-3.5 h-3.5" />
          Files
          {droppedFiles.length > 0 && (
            <span className="ml-1 w-4 h-4 flex items-center justify-center
                             rounded-full bg-primary-100 dark:bg-primary-500/20
                             text-[10px] font-bold text-primary-600 dark:text-primary-400">
              {droppedFiles.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'outline' && (
          <div className="space-y-0.5">
            {headings.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-white/30 text-center py-6">
                No headings found in document
              </p>
            ) : (
              headings.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onHeadingClick(h.id)}
                  className="w-full text-left px-2 py-1.5 rounded-md text-xs
                             text-gray-700 dark:text-white/70
                             hover:bg-gray-100 dark:hover:bg-white/5
                             transition-colors truncate"
                  style={{ paddingLeft: `${(h.level - 1) * 12 + 8}px` }}
                >
                  <span className={`${
                    h.level === 1
                      ? 'font-semibold'
                      : h.level === 2
                        ? 'font-medium'
                        : 'font-normal text-gray-500 dark:text-white/50'
                  }`}>
                    {h.text}
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-2">
            {droppedFiles.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-white/30 text-center py-6">
                Drop PDF or image files onto the viewer
              </p>
            ) : (
              droppedFiles.map((file, idx) => {
                const Icon = fileIcon(file);
                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg
                               bg-white dark:bg-white/5 border border-gray-100
                               dark:border-white/10 group"
                  >
                    <Icon className="w-4 h-4 text-primary-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700
                                   dark:text-white/80 truncate">
                        {file.name}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-white/30">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveFile(idx)}
                      className="shrink-0 p-1 rounded text-gray-300
                                 hover:text-red-500 transition-colors
                                 opacity-0 group-hover:opacity-100"
                      title="Remove file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * PDFViewer -- comprehensive document viewer.
 * Renders HTML content from the template engine with full viewer controls,
 * drag-and-drop file attachment, email integration, and a collapsible sidebar.
 *
 * @param {string}   content       - HTML content to display
 * @param {string}   title         - document title
 * @param {function} onEmail       - optional callback when email is sent
 * @param {function} onDownload    - optional callback when downloaded
 * @param {array}    attachments   - pre-loaded attachments
 * @param {string}   clientEmail   - pre-fill email recipient
 * @param {string}   className     - additional CSS classes
 */
export default function PDFViewer({
  content = '',
  title = 'Untitled Document',
  onEmail,
  onDownload,
  attachments = [],
  clientEmail = '',
  className = '',
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState(null); // 'page' | 'width' | null
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('outline');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState([]);
  const [gotoPageInput, setGotoPageInput] = useState('');

  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const viewerRef = useRef(null);
  const [blobUrls, setBlobUrls] = useState(new Map());

  // ── Parse headings from content ────────────────────────────────────────────
  const headings = useMemo(() => extractHeadings(content), [content]);
  const processedContent = useMemo(
    () => injectHeadingIds(content, headings),
    [content, headings],
  );

  // ── Initialize dropped files from attachments prop ─────────────────────────
  useEffect(() => {
    if (attachments.length > 0) {
      setDroppedFiles(attachments);
    }
  }, [attachments]);

  // ── Manage blob URLs for image file previews ──────────────────────────────
  useEffect(() => {
    const newUrls = new Map();
    droppedFiles.forEach((file, idx) => {
      if (file.type?.startsWith('image/')) {
        newUrls.set(idx, URL.createObjectURL(file));
      }
    });
    setBlobUrls(newUrls);
    return () => {
      newUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [droppedFiles]);

  // ── Page calculation ───────────────────────────────────────────────────────
  // We estimate pages based on content height vs visible viewport height.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      const viewportHeight = viewerRef.current?.clientHeight || 800;
      const contentHeight = el.scrollHeight;
      const pages = Math.max(1, Math.ceil(contentHeight / viewportHeight));
      setTotalPages(pages);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [processedContent, zoom]);

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => {
    setFitMode(null);
    setZoom((z) => {
      const idx = ZOOM_LEVELS.indexOf(z);
      if (idx >= 0 && idx < ZOOM_LEVELS.length - 1) return ZOOM_LEVELS[idx + 1];
      const next = ZOOM_LEVELS.find((l) => l > z);
      return next || z;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setFitMode(null);
    setZoom((z) => {
      const idx = ZOOM_LEVELS.indexOf(z);
      if (idx > 0) return ZOOM_LEVELS[idx - 1];
      const prev = [...ZOOM_LEVELS].reverse().find((l) => l < z);
      return prev || z;
    });
  }, []);

  const handleZoomSelect = useCallback((level) => {
    setFitMode(null);
    setZoom(level);
  }, []);

  const handleFitPage = useCallback(() => {
    setFitMode('page');
    const viewerEl = viewerRef.current;
    const contentEl = contentRef.current;
    if (!viewerEl || !contentEl) return;
    const viewerH = viewerEl.clientHeight;
    const contentH = contentEl.scrollHeight * (100 / zoom);
    const scale = Math.min(Math.floor((viewerH / contentH) * 100), 200);
    setZoom(Math.max(50, scale));
  }, [zoom]);

  const handleFitWidth = useCallback(() => {
    setFitMode('width');
    const viewerEl = viewerRef.current;
    if (!viewerEl) return;
    const viewerW = viewerEl.clientWidth - 64; // padding
    const docWidth = 816; // ~8.5 inches at 96dpi
    const scale = Math.floor((viewerW / docWidth) * 100);
    setZoom(Math.max(50, Math.min(200, scale)));
  }, []);

  // ── Page navigation ────────────────────────────────────────────────────────
  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const handleGotoPage = useCallback(() => {
    const page = parseInt(gotoPageInput, 10);
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setGotoPageInput('');
    }
  }, [gotoPageInput, totalPages]);

  // Scroll to the corresponding page section when currentPage changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const viewportHeight = viewer.clientHeight;
    const scrollTo = (currentPage - 1) * viewportHeight;
    viewer.scrollTo({ top: scrollTo, behavior: 'smooth' });
  }, [currentPage]);

  // Update current page from scroll position
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const viewportHeight = viewer.clientHeight;
          if (viewportHeight > 0) {
            const page = Math.floor(viewer.scrollTop / viewportHeight) + 1;
            setCurrentPage(Math.max(1, Math.min(totalPages, page)));
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    viewer.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewer.removeEventListener('scroll', handleScroll);
  }, [totalPages]);

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @media print {
            body { margin: 0; padding: 20mm; font-family: Arial, sans-serif; }
            @page { size: A4; margin: 15mm; }
          }
          body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; }
          h1, h2, h3 { page-break-after: avoid; }
          table { border-collapse: collapse; width: 100%; }
          td, th { border: 1px solid #ccc; padding: 8px; }
        </style>
      </head>
      <body>${processedContent}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, [processedContent, title]);

  // ── Download (print-to-PDF via browser) ────────────────────────────────────
  const handleDownload = useCallback(() => {
    handlePrint();
    onDownload?.();
  }, [handlePrint, onDownload]);

  // ── Drag-drop files ────────────────────────────────────────────────────────
  const handleFileDrop = useCallback((files) => {
    setDroppedFiles((prev) => [...prev, ...files]);
    setSidebarTab('files');
    if (!sidebarOpen) setSidebarOpen(true);
  }, [sidebarOpen]);

  const handleRemoveFile = useCallback((index) => {
    setDroppedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Heading click (scroll to) ─────────────────────────────────────────────
  const handleHeadingClick = useCallback((headingId) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const el = viewer.querySelector(`#${CSS.escape(headingId)}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (emailModalOpen) return;

      // Ctrl/Cmd + P = print
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handlePrint();
      }
      // Ctrl/Cmd + = zoom in
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      }
      // Ctrl/Cmd - = zoom out
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [emailModalOpen, handlePrint, handleZoomIn, handleZoomOut]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-gray-50 dark:bg-night-1
                  border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden ${className}`}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2 bg-white dark:bg-night-3
                      border-b border-gray-200 dark:border-white/10 shrink-0">
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen((s) => !s)}
          className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                     hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen
            ? <PanelLeftClose className="w-4 h-4" />
            : <PanelLeft className="w-4 h-4" />}
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

        {/* Document title */}
        <div className="flex items-center gap-1.5 mr-auto min-w-0">
          <FileText className="w-4 h-4 text-primary-500 shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-white/80 truncate max-w-[200px]">
            {title}
          </span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-white/60">
            <input
              type="text"
              className="w-8 text-center py-0.5 rounded border border-gray-200
                         dark:border-white/10 bg-white dark:bg-white/5
                         text-xs text-gray-700 dark:text-white/80
                         focus:outline-none focus:ring-1 focus:ring-primary-500/40"
              value={gotoPageInput || currentPage}
              onChange={(e) => setGotoPageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGotoPage()}
              onBlur={() => {
                handleGotoPage();
                setGotoPageInput('');
              }}
            />
            <span>/</span>
            <span>{totalPages}</span>
          </div>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= ZOOM_LEVELS[0]}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <select
            value={ZOOM_LEVELS.includes(zoom) ? zoom : ''}
            onChange={(e) => handleZoomSelect(parseInt(e.target.value, 10))}
            className="w-16 text-center py-0.5 rounded border border-gray-200
                       dark:border-white/10 bg-white dark:bg-white/5
                       text-xs text-gray-700 dark:text-white/80
                       focus:outline-none focus:ring-1 focus:ring-primary-500/40
                       cursor-pointer appearance-none"
          >
            {ZOOM_LEVELS.map((level) => (
              <option key={level} value={level}>{level}%</option>
            ))}
          </select>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Fit controls */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleFitPage}
            className={`p-1.5 rounded-lg transition-colors ${
              fitMode === 'page'
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/5'
            }`}
            title="Fit to page"
          >
            <Maximize className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitWidth}
            className={`p-1.5 rounded-lg transition-colors ${
              fitMode === 'width'
                ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-white/50 hover:bg-gray-100 dark:hover:bg-white/5'
            }`}
            title="Fit to width"
          >
            <Columns className="w-4 h-4" />
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={handlePrint}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            title="Print document"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            title="Download as PDF"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setEmailModalOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            title="Email document"
          >
            <Mail className="w-4 h-4" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/50
                       hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen
              ? <Minimize className="w-4 h-4" />
              : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Body (sidebar + viewer) ──────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 bg-white dark:bg-night-3
                          border-r border-gray-200 dark:border-white/10">
            <ViewerSidebar
              headings={headings}
              droppedFiles={droppedFiles}
              onRemoveFile={handleRemoveFile}
              onHeadingClick={handleHeadingClick}
              activeTab={sidebarTab}
              onTabChange={setSidebarTab}
            />
          </div>
        )}

        {/* Document viewer area */}
        <DropZone onFileDrop={handleFileDrop}>
          <div
            ref={viewerRef}
            className="h-full overflow-auto bg-gray-100 dark:bg-night-0"
          >
            <div className="flex justify-center py-8 px-8">
              <div
                ref={contentRef}
                className="bg-white dark:bg-night-3 shadow-lg rounded-sm
                           border border-gray-200 dark:border-white/10"
                style={{
                  width: `${(816 * zoom) / 100}px`,
                  minHeight: `${(1056 * zoom) / 100}px`,
                  transformOrigin: 'top center',
                }}
              >
                {/* Rendered HTML content */}
                <div
                  className="p-12 prose prose-sm dark:prose-invert max-w-none
                             text-gray-800 dark:text-white/85
                             prose-headings:text-gray-900 dark:prose-headings:text-white/90
                             prose-p:text-gray-700 dark:prose-p:text-white/75
                             prose-table:border-collapse
                             prose-td:border prose-td:border-gray-200
                             dark:prose-td:border-white/10 prose-td:p-2
                             prose-th:border prose-th:border-gray-200
                             dark:prose-th:border-white/10 prose-th:p-2
                             prose-th:bg-gray-50 dark:prose-th:bg-white/5"
                  style={{
                    fontSize: `${(14 * zoom) / 100}px`,
                    lineHeight: 1.7,
                  }}
                  dangerouslySetInnerHTML={{ __html: processedContent }}
                />

                {/* Dropped file previews */}
                {droppedFiles.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-white/10 p-6">
                    <p className="text-xs font-semibold text-gray-500 dark:text-white/40 mb-3 uppercase tracking-wider">
                      Attached Files
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {droppedFiles.map((file, idx) => {
                        const isImage = file.type?.startsWith('image/');
                        return (
                          <div
                            key={`${file.name}-${idx}`}
                            className="relative group rounded-lg border border-gray-200
                                       dark:border-white/10 overflow-hidden"
                          >
                            {isImage && blobUrls.get(idx) ? (
                              <img
                                src={blobUrls.get(idx)}
                                alt={file.name}
                                className="w-full h-32 object-cover"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-32
                                              bg-gray-50 dark:bg-white/5">
                                <FileText className="w-10 h-10 text-gray-300 dark:text-white/20" />
                              </div>
                            )}
                            <div className="px-2.5 py-2 bg-white dark:bg-night-3">
                              <p className="text-xs text-gray-700 dark:text-white/70 truncate">
                                {file.name}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-white/30">
                                {formatFileSize(file.size)}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveFile(idx)}
                              className="absolute top-1 right-1 p-1 rounded-full
                                         bg-black/50 text-white opacity-0
                                         group-hover:opacity-100 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </DropZone>
      </div>

      {/* ── Email Modal ──────────────────────────────────────────────────── */}
      <DocumentEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title={title}
        htmlContent={content}
        clientEmail={clientEmail}
        droppedFiles={droppedFiles}
        onEmailSent={onEmail}
      />
    </div>
  );
}
