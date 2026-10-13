import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, AlertTriangle, AlertOctagon, Wrench, X, ExternalLink } from 'lucide-react';
import api from '../../services/api';

const SEVERITY_META = {
  info:        { icon: Info,          bg: 'bg-blue-600',   text: 'text-white' },
  warning:     { icon: AlertTriangle, bg: 'bg-amber-500',  text: 'text-white' },
  critical:    { icon: AlertOctagon,  bg: 'bg-red-600',    text: 'text-white' },
  maintenance: { icon: Wrench,        bg: 'bg-violet-600', text: 'text-white' },
};

export default function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('dismissed_announcements') || '[]'); }
    catch { return []; }
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['runtime-announcements'],
    queryFn: () => api.get('/runtime/announcements').then(r => {
      const d = r.data;
      return d?.data ?? (Array.isArray(d) ? d : []);
    }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const dismiss = useCallback((id) => {
    setDismissed(prev => {
      const next = [...prev, id];
      sessionStorage.setItem('dismissed_announcements', JSON.stringify(next));
      return next;
    });
  }, []);

  const visible = announcements.filter(a => !dismissed.includes(a.id));
  if (!visible.length) return null;

  return (
    <div className="flex flex-col">
      {visible.map(a => {
        const meta = SEVERITY_META[a.severity] || SEVERITY_META.info;
        const Icon = meta.icon;
        return (
          <div key={a.id} className={`${meta.bg} ${meta.text} px-4 py-2.5 flex items-center gap-3 text-sm`}>
            <Icon className="h-4 w-4 shrink-0 opacity-90" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">{a.title}</span>
              {a.message && <span className="ml-1.5 opacity-90">&mdash; {a.message}</span>}
            </div>
            {a.action_url && (
              <a href={a.action_url} target="_blank" rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1 underline underline-offset-2 opacity-90 hover:opacity-100">
                {a.action_label || 'Learn more'} <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {a.is_dismissible && (
              <button onClick={() => dismiss(a.id)} className="shrink-0 opacity-70 hover:opacity-100" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
