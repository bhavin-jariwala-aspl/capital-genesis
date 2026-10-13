import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import { Search, FileText } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';

const ACTION_COLOR = {
  'tenant':       'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400',
  'user':         'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  'flag':         'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  'plan':         'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  'security':     'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  'announcement': 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
};

function getActionCategory(action) {
  const prefix = action?.split('.')[0];
  return ACTION_COLOR[prefix] || 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400';
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data } = useQuery({
    queryKey: ['platform-audit', { page, action, targetType, from, to }],
    queryFn: () => platformService.listAuditLog({
      page, limit: 30,
      action: action || undefined,
      target_type: targetType || undefined,
      from: from || undefined,
      to: to || undefined,
    }),
    staleTime: 15_000,
  });

  const logs = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={FileText}
        eyebrow="Platform"
        title="Platform Audit Log"
        subtitle="Every platform admin action is recorded with full context."
        className="!mb-0"
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Filter by action..." value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
        </div>
        <select value={targetType} onChange={e => { setTargetType(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white">
          <option value="">All targets</option>
          <option value="tenant">Tenant</option><option value="user">User</option>
          <option value="feature_flag">Feature Flag</option><option value="plan">Plan</option>
          <option value="announcement">Announcement</option><option value="security">Security</option>
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} title="From date"
          className="px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
        <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} title="To date"
          className="px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-white/[0.06]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase">Timestamp</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase">Admin</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase">Action</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase">Target</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase">Details</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/40 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{log.admin_id}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getActionCategory(log.action)}`}>{log.action}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-white/60">
                  {log.target_type && <span className="text-xs">{log.target_type}:{log.target_id}</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-white/40 max-w-[200px] truncate" title={JSON.stringify(log.details)}>
                  {log.details ? JSON.stringify(log.details).slice(0, 60) : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 dark:text-white/30 font-mono">{log.ip_address || '—'}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No audit entries found</td></tr>
            )}
          </tbody>
        </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-white/[0.06]">
            <p className="text-xs text-gray-500 dark:text-white/40">{pagination.total} entries</p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2.5 py-1 text-xs rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">Prev</button>
              <span className="px-2.5 py-1 text-xs text-gray-600 dark:text-white/50">{page} / {pagination.pages}</span>
              <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="px-2.5 py-1 text-xs rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
