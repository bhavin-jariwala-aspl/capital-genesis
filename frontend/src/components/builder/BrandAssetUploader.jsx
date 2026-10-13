import { useRef, useState } from 'react';
import { Upload, Trash2, Image as ImageIcon, Loader2, Link as LinkIcon } from 'lucide-react';
import clsx from 'clsx';
import { settingsService } from '../../services/settings.service';

const ACCEPT = { logo: 'image/png,image/jpeg,image/webp,image/svg+xml', logo_dark: 'image/png,image/jpeg,image/webp,image/svg+xml',
  icon: 'image/png,image/jpeg,image/webp,image/svg+xml', favicon: 'image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon',
  login_image: 'image/png,image/jpeg,image/webp' };
const MAX_MB = { login_image: 4 };

/**
 * BrandAssetUploader — drop zone + preview for one brand asset.
 *
 * Uploads go straight to `POST /settings/branding/assets`, which stores the
 * file and points the matching setting at its immutable URL, so an upload is
 * saved the moment it finishes (there is nothing to "Save" afterwards). A URL
 * can also be pasted for assets hosted elsewhere.
 *
 * Props:
 *   kind      logo | logo_dark | icon | favicon | login_image
 *   value     current URL (or '')
 *   onChange  (url, settingsValues|null) — called after upload/remove/paste
 *   surface   'light' | 'dark' | 'brand' — the preview backdrop
 *   shape     'wide' | 'square'
 */
export default function BrandAssetUploader({ kind, label, hint, value, onChange, surface = 'light', shape = 'wide', className }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');

  const accept = ACCEPT[kind] ?? ACCEPT.logo;
  const maxMb = MAX_MB[kind] ?? 1;

  const upload = async (file) => {
    setError(null);
    if (!file) return;
    if (!accept.split(',').includes(file.type)) { setError('Use PNG, JPEG, WebP or SVG.'); return; }
    if (file.size > maxMb * 1024 * 1024) { setError(`Keep it under ${maxMb} MB.`); return; }
    setBusy(true);
    try {
      const res = await settingsService.uploadBrandAsset(kind, file);
      const out = res?.data ?? res;
      onChange?.(out.url, out.settings?.values ?? null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || err?.response?.data?.message || 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null); setBusy(true);
    try {
      const res = await settingsService.removeBrandAsset(kind);
      const out = res?.data ?? res;
      onChange?.('', out.settings?.values ?? null);
    } catch (err) {
      setError(err?.response?.data?.error?.message || 'Could not remove.');
    } finally { setBusy(false); }
  };

  const onDrop = (e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]); };

  const backdrop = surface === 'dark' ? 'bg-night-1 border-white/10' : surface === 'brand' ? 'bg-gradient-to-br from-primary-600 to-primary-800 border-primary-700' : 'bg-white border-gray-200 dark:bg-white/[0.04] dark:border-white/10';

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
        <button type="button" className="text-[11px] text-gray-400 hover:text-primary-600 inline-flex items-center gap-1" onClick={() => setUrlMode((v) => !v)}>
          <LinkIcon className="h-3 w-3" /> {urlMode ? 'Upload instead' : 'Use a URL'}
        </button>
      </div>
      {hint && <p className="text-xs text-gray-500 -mt-1">{hint}</p>}

      <div
        role="button" tabIndex={0}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={clsx('relative rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden group',
          shape === 'square' ? 'h-28 w-28' : 'h-28 w-full',
          backdrop, drag && 'ring-2 ring-primary-400 ring-offset-2', busy && 'opacity-60 pointer-events-none')}
        aria-label={`Upload ${label}`}
      >
        {value ? (
          <img src={value} alt={label} className={clsx('h-full w-full p-4', shape === 'square' ? 'object-contain' : kind === 'login_image' ? 'object-cover p-0' : 'object-contain')} />
        ) : (
          <div className={clsx('h-full w-full flex flex-col items-center justify-center gap-1.5 text-xs', surface === 'light' ? 'text-gray-400' : 'text-white/60')}>
            <span className={clsx('h-9 w-9 rounded-xl inline-flex items-center justify-center', surface === 'light' ? 'bg-gray-100 dark:bg-white/10' : 'bg-white/15')}>
              <ImageIcon className="h-4 w-4" />
            </span>
            <span>Drop an image or <span className="font-medium underline underline-offset-2">browse</span></span>
          </div>
        )}
        <div className={clsx('absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 py-1.5 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity',
          'bg-gradient-to-t from-black/60 to-transparent text-white')}>
          <Upload className="h-3 w-3" /> {value ? 'Replace' : 'Upload'} · ≤ {maxMb} MB
        </div>
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/40"><Loader2 className="h-5 w-5 animate-spin text-primary-600" /></div>}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {urlMode && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (url.trim()) { onChange?.(url.trim(), null); setUrl(''); setUrlMode(false); } }}>
          <input className="form-input text-xs py-1.5" placeholder="https://…/logo.svg" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className="btn-primary rounded-lg px-3 text-xs font-medium">Use</button>
        </form>
      )}

      <div className="flex items-center justify-between min-h-[1rem]">
        {error ? <p className="form-error">{error}</p> : <span />}
        {value && (
          <button type="button" onClick={remove} className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-600 transition-colors">
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
