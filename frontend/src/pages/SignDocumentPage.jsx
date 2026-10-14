import { useState, useEffect, useRef, useCallback } from 'react';
import { useWorkspaceBranding } from '../hooks/useWorkspaceBranding';
import { useParams } from 'react-router-dom';
import { FileText, PenLine, Type, Check, AlertCircle, X, RotateCcw } from 'lucide-react';
import { documentService } from '../services/document.service';
import { formatSize } from '../utils/formatters';
import { promptDialog } from '../utils/dialog';

/* Canvas-based signature pad — pointer events, no dependency. */
function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches?.[0] ?? e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    onChange('');
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={440}
        height={140}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        className="w-full rounded-lg border border-gray-200 dark:border-white/10 bg-white touch-none cursor-crosshair"
      />
      <button type="button" onClick={clear} className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
        <RotateCcw className="h-3 w-3" /> Clear
      </button>
    </div>
  );
}

export default function SignDocumentPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  useWorkspaceBranding(info?.tenant_id);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('drawn'); // drawn | typed
  const [typed, setTyped] = useState('');
  const [drawn, setDrawn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // 'signed' | 'declined'

  const load = useCallback(() => {
    documentService.getSignRequest(token)
      .then(res => setInfo(res?.data ?? res))
      .catch(() => setError('This signing link is invalid, already completed, or expired.'))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const data = mode === 'typed' ? typed.trim() : drawn;
    if (!data) { setError(mode === 'typed' ? 'Please type your full name.' : 'Please draw your signature.'); return; }
    setSubmitting(true); setError('');
    try {
      await documentService.submitSignature(token, { type: mode, data });
      setDone('signed');
    } catch (err) { setError(err?.response?.data?.error ?? 'Could not submit signature.'); }
    finally { setSubmitting(false); }
  };

  const decline = async () => {
    const reason = await promptDialog({
      tone: 'warning',
      title: 'Decline to sign',
      message: 'Let the sender know why, or leave this blank.',
      placeholder: 'Reason (optional)',
      confirmLabel: 'Decline',
    });
    if (reason === null) return;
    setSubmitting(true);
    try { await documentService.declineSignature(token, { reason }); setDone('declined'); }
    catch { setError('Could not decline.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-night-1 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/[0.08] shadow-xl p-8">
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
        ) : done === 'signed' ? (
          <div className="text-center py-6">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Check className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Signed — thank you!</p>
            <p className="text-sm text-gray-500 mt-1">Your signature has been recorded.</p>
          </div>
        ) : done === 'declined' ? (
          <div className="text-center py-6">
            <X className="h-10 w-10 text-gray-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-300">You declined to sign this document.</p>
          </div>
        ) : error && !info ? (
          <div className="text-center py-6">
            <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
          </div>
        ) : info && (
          <>
            <div className="flex items-start gap-3 mb-5">
              <div className="h-12 w-12 rounded-xl bg-primary-100 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
                <FileText className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 break-words">{info.document?.filename}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatSize(info.document?.file_size)}</p>
                <a href={`/api/documents/sign/${token}/document`} target="_blank" rel="noreferrer"
                   className="text-xs text-primary-600 hover:underline mt-1 inline-block">Review document →</a>
              </div>
            </div>

            {info.request?.title && <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{info.request.title}</p>}
            {info.request?.message && <p className="text-sm text-gray-500 mb-3">{info.request.message}</p>}
            <p className="text-xs text-gray-500 mb-4">Signing as <strong>{info.signatory?.name}</strong> ({info.signatory?.email})</p>

            {info.signatory?.status === 'signed' ? (
              <p className="text-sm text-emerald-600 flex items-center gap-1.5"><Check className="h-4 w-4" /> You have already signed this document.</p>
            ) : (
              <>
                {/* Mode toggle */}
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setMode('drawn')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm border transition-colors ${mode === 'drawn' ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-gray-200 text-gray-500'}`}>
                    <PenLine className="h-3.5 w-3.5" /> Draw
                  </button>
                  <button onClick={() => setMode('typed')} className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm border transition-colors ${mode === 'typed' ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-gray-200 text-gray-500'}`}>
                    <Type className="h-3.5 w-3.5" /> Type
                  </button>
                </div>

                {mode === 'drawn'
                  ? <SignaturePad onChange={setDrawn} />
                  : (
                    <input
                      type="text" placeholder="Type your full legal name"
                      value={typed} onChange={e => setTyped(e.target.value)}
                      className="input w-full text-xl" style={{ fontFamily: 'cursive' }}
                    />
                  )}

                {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

                <div className="flex gap-2 mt-5">
                  <button onClick={decline} disabled={submitting} className="px-4 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 disabled:opacity-60">
                    Decline
                  </button>
                  <button onClick={submit} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-on-primary font-medium py-2 transition-colors disabled:opacity-60">
                    <Check className="h-4 w-4" /> {submitting ? 'Submitting…' : 'Sign document'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 text-center mt-4">
                  By signing you agree your electronic signature is legally binding.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
