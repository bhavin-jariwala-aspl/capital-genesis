import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '../../services/notification.service';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref  = useRef(null);
  const navigate = useNavigate();
  const qc   = useQueryClient();

  // ── Close on outside click ───────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Unread count (polls every 30s) ───────────────────────────────────────
  const { data: countData } = useQuery({
    queryKey:  ['notif-count'],
    queryFn:   () => notificationService.getUnreadCount().then(r => r.data?.data?.count ?? 0),
    refetchInterval: 30_000,
  });
  const count = countData ?? 0;

  // ── Notifications list ───────────────────────────────────────────────────
  const { data: notifData, isLoading } = useQuery({
    queryKey:  ['notifications'],
    queryFn:   () => notificationService.getNotifications().then(r => r.data?.data ?? []),
    enabled:   open,
    staleTime: 10_000,
  });
  const notifications = useMemo(() => notifData ?? [], [notifData]);

  // ── Mark read ────────────────────────────────────────────────────────────
  const markRead = useMutation({
    mutationFn: (ids) => notificationService.markRead(ids),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notif-count'] });
    },
  });

  const handleOpen = () => setOpen(o => !o);

  // Mark unread as seen once the panel is open AND its list has actually loaded.
  // (The list query is `enabled: open`, so at click time `notifications` is still
  // empty — marking there was a no-op on first open.) markRead → invalidate makes
  // this idempotent: after the refetch there are no unread ids left to mark.
  useEffect(() => {
    if (!open || markRead.isPending) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length) markRead.mutate(unreadIds);
  }, [open, notifications, markRead]);

  const handleClick = (n) => {
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  const handleMarkAll = useCallback(() => markAll.mutate(), [markAll]);
  const handleClosePanel = useCallback(() => setOpen(false), []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative p-1.5 rounded-lg text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/70 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-night-3 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">Notifications</h3>
            <div className="flex items-center gap-2">
              {notifications.some(n => !n.is_read) && (
                <button
                  onClick={handleMarkAll}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
                >
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
              <button onClick={handleClosePanel} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/60">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-white/5">
            {isLoading ? (
              <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No notifications yet</p>
            ) : (
              notifications.slice(0, 20).map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={clsx(
                    'w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors',
                    !n.is_read && 'bg-primary-50/60 dark:bg-primary-950/20',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <div className="mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full bg-primary-500" />}
                    <div className={clsx('flex-1 min-w-0', n.is_read && 'pl-3.5')}>
                      <p className="text-xs font-medium text-gray-800 dark:text-white/90 leading-tight">{n.title}</p>
                      {n.body && <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
