import { useState, useEffect, useCallback } from 'react';
import { Share2, Copy, Check, BarChart3, Eye, Download, XCircle, Plus } from 'lucide-react';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import { documentService } from '../../services/document.service';
import { fmtDate, fmtDateTime } from '../../utils/formatters';
import { showError } from '../../utils/dialog';

/* ── Share & Analytics Modal ──────────────────────────────── *
 * Secure share links for one document, with view/download analytics. Used by
 * Document Management and by the Docs tab of a record (e.g. sharing an
 * information memorandum with an investor). */

export default function DocumentShareModal({ open, onClose, doc }) {
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
