import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Clock, Lock, ShieldCheck, Upload } from 'lucide-react';
import Spinner from '../components/ui/Spinner';
import BrandLogo from '../components/ui/BrandLogo';
import { uploadLinksService } from '../services/uploadLinks.service';
import { useWorkspaceBranding } from '../hooks/useWorkspaceBranding';
import { useAppearanceStore } from '../store/appearanceStore';
import { apiErrorText } from '../utils/record';

/**
 * UploadPage — /upload/:token. A client sends the documents a record still
 * needs, without signing in. The signed link names the record and expires;
 * the page shows only what is requested and whether it has arrived.
 */
const ACCEPT = 'application/pdf,image/jpeg,image/png';
const MAX_BYTES = 10 * 1024 * 1024;

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Item({ item, token, onUploaded }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (!ACCEPT.split(',').includes(file.type)) { setError('Please choose a PDF, JPEG or PNG file.'); return; }
    if (file.size > MAX_BYTES) { setError('Files must be under 10 MB.'); return; }
    setBusy(true);
    try {
      await uploadLinksService.upload(token, { filename: file.name, mime_type: file.type, data: await readBase64(file), category: item.category });
      setDone(true);
      onUploaded();
    } catch (err) { setError(apiErrorText(err, 'The upload failed. Please try again.')); } finally { setBusy(false); }
  };
  const received = item.received || done;
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {received
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          : <span className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-amber-400" />}
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white">{item.label}{!item.required && <span className="font-normal text-gray-400"> · optional</span>}</p>
          <p className={clsx('text-xs', received ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>{received ? 'Received — thank you' : 'Needed'}</p>
          {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
      <div className="sm:shrink-0">
        <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={pick} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()}
          className={clsx('inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition sm:w-auto',
            received ? 'border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/5'
              : 'bg-primary-600 text-on-primary hover:bg-primary-700', busy && 'opacity-60')}>
          {busy ? <Spinner size="sm" /> : <Upload className="h-4 w-4" />}{received ? 'Add another' : 'Upload'}
        </button>
      </div>
    </li>
  );
}

export default function UploadPage() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  useWorkspaceBranding(info?.tenant_id);
  const appearance = useAppearanceStore((s) => s.current);

  const load = useCallback(() => uploadLinksService.describe(token)
    .then((r) => { setInfo(r.data); setError(null); })
    .catch((err) => setError(apiErrorText(err, 'This upload link is invalid or has expired.'))), [token]);
  useEffect(() => { load(); }, [load]);

  if (error && !info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6 dark:bg-night-1">
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-medium text-gray-900 dark:text-white">This link no longer works</p>
          <p className="mt-1 text-sm text-gray-500">It may have expired. Please ask your relationship manager for a new one.</p>
        </div>
      </div>
    );
  }
  if (!info) return <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-night-1"><Spinner /></div>;

  const outstanding = info.items.filter((i) => i.required && !i.received).length;
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-night-1">
      <header className="bg-gradient-to-br from-primary-700 via-mid-600 to-accent-600 text-white">
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" onDark appearance={appearance} showName={false} />
            {info.workspace && <span className="font-display text-lg font-semibold">{info.workspace}</span>}
          </div>
          <h1 className="mt-6 font-display text-2xl font-semibold sm:text-3xl">Send your documents</h1>
          <p className="mt-1 text-white/80">{info.what}: <strong>{info.reference}</strong></p>
        </div>
      </header>
      <main className="mx-auto -mt-4 max-w-2xl px-4 pb-10 sm:px-6">
        <div className="rounded-3xl bg-white p-5 shadow-xl shadow-gray-200/60 ring-1 ring-black/5 sm:p-7 dark:bg-night-2 dark:shadow-none dark:ring-white/10">
          <div className={clsx('rounded-xl px-4 py-3 text-sm', outstanding ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200')}>
            {outstanding
              ? `${outstanding} document${outstanding > 1 ? 's' : ''} still needed. Upload each one below — a photo or a PDF is fine.`
              : 'We have everything we need. Thank you — you can close this page.'}
          </div>
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/10">
            {info.items.map((i, n) => <Item key={`${i.category}-${n}`} item={i} token={token} onUploaded={load} />)}
          </ul>
          <div className="mt-5 grid gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500 sm:grid-cols-3 dark:border-white/10 dark:text-white/50">
            <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />Sent securely</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />PDF, JPEG or PNG, up to 10 MB</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Link valid until {new Date(info.expires_at).toLocaleDateString()}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
