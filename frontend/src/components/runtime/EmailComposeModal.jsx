import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailService } from '../../services/email.service';
import Button from '../ui/Button';
import clsx from 'clsx';
import { X, Mail, Send, Eye, ChevronDown, AlertCircle, Check } from 'lucide-react';

/**
 * EmailComposeModal — overlay for composing and sending emails using templates.
 * Triggered from the Email pill in the Activity LogForm.
 *
 * Variable resolution:
 *   When the user selects a template, the modal calls the backend
 *   GET /api/email/templates/:id/resolve/:recordId endpoint. The backend
 *   loads the record's CRM entity fields and maps them onto the template's
 *   {{variables}} using direct match, alias lookup, and prefix stripping.
 *   The resolved values are shown in editable fields so the user can review
 *   and adjust before sending.
 *
 * Props:
 *   open           – boolean controlling visibility
 *   onClose        – callback to close the modal
 *   recordId       – the CRM record this email relates to
 *   relatedType    – entity type string: lead, contact, account, opportunity, case
 *   recordData     – the record's CRM field data (fallback for variable population)
 *   defaultTo      – pre-fill "To" field (e.g. from a contact's email)
 */
export default function EmailComposeModal({
  open,
  onClose,
  recordId,
  objectId,
  relatedType,
  recordData: _recordData = {},
  defaultTo = '',
}) {
  const qc = useQueryClient();

  // Auto-close after a successful send is deferred ~1.5s; clear it on unmount so
  // onClose can't fire against an already-unmounted modal.
  const closeTimerRef = useRef(null);
  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [mode, setMode]               = useState('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [toEmail, setToEmail]         = useState(defaultTo);
  const [ccEmails, setCcEmails]       = useState('');
  const [bccEmails, setBccEmails]     = useState('');
  const [variables, setVariables]     = useState({});
  const [rawSubject, setRawSubject]   = useState('');
  const [rawBodyHtml, setRawBodyHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sendResult, setSendResult]   = useState(null);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setToEmail(defaultTo);
      setSelectedTemplateId('');
      setCcEmails('');
      setBccEmails('');
      setVariables({});
      setRawSubject('');
      setRawBodyHtml('');
      setShowPreview(false);
      setSendResult(null);
      setMode('template');
    }
  }, [open, defaultTo]);

  // ── Fetch templates scoped to this object ───────────────────────────────────
  const { data: templatesData } = useQuery({
    queryKey: ['email-templates', objectId],
    queryFn:  () => emailService.getTemplates({ is_active: 'true', object_id: objectId, limit: 100 })
      .then(r => r.data?.templates ?? r.data ?? []),
    enabled:  open && !!objectId,
    staleTime: 60_000,
  });
  const templates = templatesData ?? [];

  // ── Fetch selected template detail ─────────────────────────────────────────
  const { data: selectedTemplate } = useQuery({
    queryKey: ['email-template', selectedTemplateId],
    queryFn:  () => emailService.getTemplate(selectedTemplateId).then(r => r.data ?? r),
    enabled:  !!selectedTemplateId,
    staleTime: 60_000,
  });

  const tplVarList = useMemo(() => {
    if (!selectedTemplate?.variables) return [];
    return Array.isArray(selectedTemplate.variables) ? selectedTemplate.variables : [];
  }, [selectedTemplate]);

  // ── Fetch field labels for the object (for human-readable variable names) ──
  const { data: fieldsData } = useQuery({
    queryKey: ['template-fields', objectId],
    queryFn:  () => emailService.getTemplateFields(objectId).then(r => r.data ?? r),
    enabled:  open && !!objectId,
    staleTime: 60_000,
  });

  const varLabelMap = useMemo(() => {
    const map = {};
    for (const f of (fieldsData?.fields ?? [])) map[f.name] = f.label;
    for (const sv of (fieldsData?.system_variables ?? [])) map[sv.name] = sv.label;
    return map;
  }, [fieldsData]);

  /** Convert snake_case to Title Case as fallback. */
  const getVarLabel = useCallback((name) => {
    return varLabelMap[name] || name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }, [varLabelMap]);

  // ── Server-side variable resolution ────────────────────────────────────────
  // When a template is selected AND we have a recordId, ask the backend to
  // resolve {{variables}} from the record's actual CRM entity data.
  const { data: resolvedData } = useQuery({
    queryKey: ['email-resolve', selectedTemplateId, recordId],
    queryFn:  () => emailService.resolveVariables(selectedTemplateId, recordId)
      .then(r => r.data ?? r),
    enabled:  !!selectedTemplateId && !!recordId,
    staleTime: 30_000,
  });

  // Apply resolved variables and to_email when they arrive
  useEffect(() => {
    if (!resolvedData) return;
    if (resolvedData.variables) {
      setVariables(resolvedData.variables);
    }
    if (resolvedData.to_email && !toEmail) {
      setToEmail(resolvedData.to_email);
    }
  }, [resolvedData, toEmail]);

  // ── Preview ────────────────────────────────────────────────────────────────
  const previewMutation = useMutation({
    mutationFn: () => emailService.renderTemplate(selectedTemplateId, variables)
      .then(r => r.data ?? r),
  });

  const { mutate: runPreview } = previewMutation;
  const handlePreview = useCallback(() => {
    if (!selectedTemplateId) return;
    runPreview();
    setShowPreview(true);
  }, [selectedTemplateId, runPreview]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () => {
      const ccArr  = ccEmails.split(',').map(s => s.trim()).filter(Boolean);
      const bccArr = bccEmails.split(',').map(s => s.trim()).filter(Boolean);

      if (mode === 'template') {
        return emailService.sendEmail({
          template_id:       Number(selectedTemplateId),
          variables,
          to_email:          toEmail,
          cc_emails:         ccArr.length  ? ccArr  : undefined,
          bcc_emails:        bccArr.length ? bccArr : undefined,
          related_record_id: recordId,
          related_type:      relatedType,
          log_activity:      true,
        });
      }
      return emailService.sendRawEmail({
        to_email:          toEmail,
        subject:           rawSubject,
        body_html:         rawBodyHtml || undefined,
        body_text:         rawBodyHtml ? undefined : rawSubject,
        cc_emails:         ccArr.length  ? ccArr  : undefined,
        bcc_emails:        bccArr.length ? bccArr : undefined,
        related_record_id: recordId,
        related_type:      relatedType,
        log_activity:      true,
      });
    },
    onSuccess: () => {
      setSendResult({ success: true, message: 'Email sent successfully!' });
      qc.invalidateQueries({ queryKey: ['activities', recordId] });
      closeTimerRef.current = setTimeout(() => onClose?.(), 1500);
    },
    onError: (err) => {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to send email';
      setSendResult({ success: false, message: msg });
    },
  });

  const canSend = toEmail.trim() &&
    (mode === 'template' ? !!selectedTemplateId : rawSubject.trim());

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!open || typeof document === 'undefined') return null;

  // Portal to <body> so the fixed scrim maps to the viewport (covers header/sidebar).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in motion-reduce:animate-none">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[92vh] bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl shadow-elevated flex flex-col overflow-hidden animate-slide-up motion-reduce:animate-none">
        {/* Brand accent ribbon */}
        <div className="modal-accent" />
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/10 aurora-wash">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-violet-500" />
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Send Email</h2>
            {relatedType && (
              <span className="text-xs text-gray-400 dark:text-white/30 bg-gray-100 dark:bg-white/[0.06] px-2 py-0.5 rounded-full">
                {relatedType}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white/60 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-[400px]">
          {/* Result banner */}
          {sendResult && (
            <div className={clsx(
              'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium',
              sendResult.success
                ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
            )}>
              {sendResult.success ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {sendResult.message}
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex gap-1 bg-gray-100 dark:bg-white/[0.06] rounded-lg p-0.5">
            <button
              onClick={() => setMode('template')}
              className={clsx(
                'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                mode === 'template'
                  ? 'bg-white dark:bg-white/10 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-white/40 hover:text-gray-700',
              )}
            >
              Use Template
            </button>
            <button
              onClick={() => setMode('raw')}
              className={clsx(
                'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors',
                mode === 'raw'
                  ? 'bg-white dark:bg-white/10 text-gray-800 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-white/40 hover:text-gray-700',
              )}
            >
              Compose Manually
            </button>
          </div>

          {/* To */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">To *</label>
            <input
              type="email"
              className="form-input w-full text-sm"
              placeholder="recipient@example.com"
              value={toEmail}
              onChange={e => setToEmail(e.target.value)}
            />
          </div>

          {/* CC / BCC */}
          <details className="group">
            <summary className="text-xs text-primary-600 dark:text-primary-400 cursor-pointer font-medium flex items-center gap-1">
              <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
              CC / BCC
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">CC</label>
                <input className="form-input w-full text-sm" placeholder="Comma-separated emails"
                  value={ccEmails} onChange={e => setCcEmails(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">BCC</label>
                <input className="form-input w-full text-sm" placeholder="Comma-separated emails"
                  value={bccEmails} onChange={e => setBccEmails(e.target.value)} />
              </div>
            </div>
          </details>

          {/* ── Template mode ─────────────────────────────────────────────── */}
          {mode === 'template' && (
            <>
              {/* Template selector */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">
                  Template *
                </label>
                <select
                  className="form-input w-full text-sm"
                  value={selectedTemplateId}
                  onChange={e => setSelectedTemplateId(e.target.value)}
                >
                  <option value="">Select a template…</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.category ? `(${t.category})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Variable fields — auto-filled from record via backend resolve */}
              {tplVarList.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-white/50 mb-2">
                    Template Variables
                    <span className="text-gray-400 dark:text-white/30 font-normal ml-1">
                      — auto-filled from record data
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {tplVarList.map(varName => (
                      <div key={varName}>
                        <label className="block text-[11px] text-gray-500 dark:text-white/40 mb-0.5 font-medium">
                          {getVarLabel(varName)}
                        </label>
                        <input
                          className={clsx(
                            'form-input w-full text-sm',
                            variables[varName] ? 'border-green-200 dark:border-green-800/30' : '',
                          )}
                          placeholder={getVarLabel(varName)}
                          value={variables[varName] || ''}
                          onChange={e => setVariables(v => ({ ...v, [varName]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {showPreview && previewMutation.data && (
                <div className="border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
                  <div className="bg-gray-50 dark:bg-white/[0.04] px-4 py-2 border-b border-gray-200 dark:border-white/10">
                    <p className="text-xs font-semibold text-gray-500 dark:text-white/40">
                      Subject: {previewMutation.data.subject}
                    </p>
                  </div>
                  <div className="p-4 max-h-48 overflow-y-auto">
                    {previewMutation.data.body_html ? (
                      <div
                        className="text-sm text-gray-700 dark:text-white/70 prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: previewMutation.data.body_html }}
                      />
                    ) : (
                      <pre className="text-sm text-gray-600 dark:text-white/60 whitespace-pre-wrap">
                        {previewMutation.data.body_text}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Raw mode ──────────────────────────────────────────────────── */}
          {mode === 'raw' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">Subject *</label>
                <input className="form-input w-full text-sm" placeholder="Email subject"
                  value={rawSubject} onChange={e => setRawSubject(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/50 mb-1">Body (HTML)</label>
                <textarea rows={6} className="form-input w-full text-sm resize-none font-mono"
                  placeholder="<p>Hello,</p>" value={rawBodyHtml} onChange={e => setRawBodyHtml(e.target.value)} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            {mode === 'template' && selectedTemplateId && (
              <Button variant="outline" size="sm" onClick={handlePreview} loading={previewMutation.isPending}>
                <Eye className="w-3.5 h-3.5" /> Preview
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => sendMutation.mutate()}
              loading={sendMutation.isPending}
              disabled={!canSend || sendMutation.isPending}
            >
              <Send className="w-3.5 h-3.5" /> Send Email
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
