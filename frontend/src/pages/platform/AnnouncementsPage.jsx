import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import { Plus, Trash2, Eye, EyeOff, AlertTriangle, Info, AlertCircle, Wrench, Megaphone } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { showError, confirmDialog } from '../../utils/dialog';

const SEVERITY_ICON = { info: Info, warning: AlertTriangle, critical: AlertCircle, maintenance: Wrench };
const SEVERITY_COLOR = {
  info:        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  warning:     'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  critical:    'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  maintenance: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
};

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '', message: '', severity: 'info', type: 'banner', target: 'all', is_dismissible: true,
    active_from: new Date().toISOString().slice(0, 16), active_to: '',
  });

  const { data } = useQuery({
    queryKey: ['platform-announcements'],
    queryFn: () => platformService.listAnnouncements({ limit: 50 }),
    staleTime: 30_000,
  });

  const announcements = data?.data || [];

  const onErr = (e) => showError(e?.response?.data?.error?.message || e?.message || 'Operation failed');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['platform-announcements'] });
  const createMut = useMutation({
    mutationFn: (d) => platformService.createAnnouncement({
      ...d,
      active_from: d.active_from ? new Date(d.active_from).toISOString() : new Date().toISOString(),
      active_to: d.active_to ? new Date(d.active_to).toISOString() : null,
    }),
    onSuccess: () => { invalidate(); setShowCreate(false); },
    onError: onErr,
  });
  const activateMut = useMutation({ mutationFn: (id) => platformService.activateAnnouncement(id), onSuccess: invalidate, onError: onErr });
  const deactivateMut = useMutation({ mutationFn: (id) => platformService.deactivateAnnouncement(id), onSuccess: invalidate, onError: onErr });
  const deleteMut = useMutation({ mutationFn: (id) => platformService.deleteAnnouncement(id), onSuccess: invalidate, onError: onErr });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={Megaphone}
        eyebrow="Platform"
        title="System Announcements"
        subtitle="Push banners, alerts, and maintenance notices to all users."
        className="!mb-0"
        actions={(
          <button onClick={() => setShowCreate(true)} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 text-sm font-medium whitespace-nowrap">
            <Plus className="h-4 w-4" /> New Announcement
          </button>
        )}
      />

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none" onClick={() => setShowCreate(false)}>
          <div className="relative w-full max-w-lg bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create Announcement</h2>
            <div className="space-y-3">
              <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
              <textarea placeholder="Message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3}
                className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
              <div className="grid grid-cols-2 gap-3">
                <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}
                  className="px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white">
                  <option value="info">Info</option><option value="warning">Warning</option>
                  <option value="critical">Critical</option><option value="maintenance">Maintenance</option>
                </select>
                <select value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}
                  className="px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white">
                  <option value="all">All Users</option><option value="admins">Admins Only</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Active From</label>
                  <input type="datetime-local" value={form.active_from} onChange={e => setForm({ ...form, active_from: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Active To (optional)</label>
                  <input type="datetime-local" value={form.active_to} onChange={e => setForm({ ...form, active_to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-white/60">
                <input type="checkbox" checked={form.is_dismissible} onChange={e => setForm({ ...form, is_dismissible: e.target.checked })} className="rounded" />
                Dismissible by users
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">Cancel</button>
              <button onClick={() => createMut.mutate(form)} disabled={!form.title || !form.message || createMut.isPending} className="px-4 py-2 text-sm bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 disabled:opacity-50">{createMut.isPending ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Announcements List */}
      <div className="space-y-3">
        {announcements.map(a => {
          const SevIcon = SEVERITY_ICON[a.severity] || Info;
          return (
            <div key={a.id} className={`bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-5 ${!a.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${SEVERITY_COLOR[a.severity]}`}>
                    <SevIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{a.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-white/60 mt-1">{a.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-white/30">
                      <span className={`font-medium px-2 py-0.5 rounded-full capitalize ${SEVERITY_COLOR[a.severity]}`}>{a.severity}</span>
                      <span>Target: {a.target}</span>
                      <span>{new Date(a.active_from).toLocaleDateString()}{a.active_to ? ` — ${new Date(a.active_to).toLocaleDateString()}` : ' — No end'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  {a.is_active ? (
                    <button onClick={() => deactivateMut.mutate(a.id)} title="Deactivate" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400">
                      <EyeOff className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={() => activateMut.mutate(a.id)} title="Activate" className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-500/20 text-green-500">
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={async () => { if (await confirmDialog({ title: 'Delete announcement', message: 'This announcement will stop showing for every tenant it targets.', confirmLabel: 'Delete' })) deleteMut.mutate(a.id); }} className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {announcements.length === 0 && (
          <div className="text-center py-12 text-gray-400">No announcements</div>
        )}
      </div>
    </div>
  );
}
