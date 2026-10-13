import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import { Shield, Key, Users, Lock, Gauge, Download, UserX, UserCheck } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import { showError, showSuccess } from '../../utils/dialog';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-primary-400" /> {title}
      </h2>
      {children}
    </div>
  );
}

export default function SecurityPage() {
  const qc = useQueryClient();
  const [resetId, setResetId] = useState('');
  const [deactivateId, setDeactivateId] = useState('');
  const [reactivateId, setReactivateId] = useState('');

  const { data: policy } = useQuery({ queryKey: ['platform-global-policy'], queryFn: platformService.getGlobalPolicy, staleTime: 60_000 });
  const { data: sessions } = useQuery({ queryKey: ['platform-sessions'], queryFn: platformService.getActiveSessions, staleTime: 30_000 });
  const { data: rateLimits } = useQuery({ queryKey: ['platform-rate-limits'], queryFn: platformService.listRateLimits, staleTime: 60_000 });
  const { data: exports } = useQuery({ queryKey: ['platform-exports'], queryFn: () => platformService.listDataExports({ limit: 10 }), staleTime: 30_000 });
  const { data: impLogs } = useQuery({ queryKey: ['platform-imp-logs'], queryFn: () => platformService.listImpersonationLogs({ limit: 10 }), staleTime: 30_000 });

  const pol = policy?.data;
  const sess = sessions?.data || [];
  const rates = rateLimits?.data || [];
  const exps = exports?.data || [];
  const imps = impLogs?.data || [];

  const onErr = (e) => showError(e?.response?.data?.error?.message || e?.message || 'Operation failed');
  const resetMut = useMutation({ mutationFn: (id) => platformService.forcePasswordReset({ employee_id: id }), onSuccess: (data) => { showSuccess({ title: 'Temporary password issued', message: 'Share it with the employee over a trusted channel — it is shown only once.', details: data?.data?.temp_password }); setResetId(''); }, onError: onErr });
  const deactMut = useMutation({ mutationFn: (id) => platformService.deactivateUser({ employee_id: id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-sessions'] }); setDeactivateId(''); }, onError: onErr });
  const reactMut = useMutation({ mutationFn: (id) => platformService.reactivateUser({ employee_id: id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-sessions'] }); setReactivateId(''); }, onError: onErr });
  const exportMut = useMutation({ mutationFn: (d) => platformService.requestDataExport(d), onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-exports'] }), onError: onErr });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={Lock}
        eyebrow="Platform"
        title="Security Controls"
        subtitle="Password policies, session management, rate limiting, and data exports."
        className="!mb-0"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Global Security Policy */}
        <Section icon={Lock} title="Global Security Policy">
          {pol ? (
            <div className="space-y-2 text-sm">
              {[
                ['MFA Required', pol.require_mfa ? 'Yes' : 'No'],
                ['Min Password Length', pol.password_min_length],
                ['Require Uppercase', pol.password_require_upper ? 'Yes' : 'No'],
                ['Require Number', pol.password_require_number ? 'Yes' : 'No'],
                ['Require Special Char', pol.password_require_special ? 'Yes' : 'No'],
                ['Password Expiry', pol.password_expiry_days === 0 ? 'Never' : `${pol.password_expiry_days} days`],
                ['Max Login Attempts', pol.max_login_attempts],
                ['Lockout Duration', `${pol.lockout_duration_min} min`],
                ['Session Timeout', `${pol.session_timeout_min} min`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between py-1.5 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
                  <span className="text-gray-600 dark:text-white/60">{label}</span>
                  <span className="font-medium text-gray-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">Loading...</p>}
        </Section>

        {/* Password & User Management */}
        <Section icon={Key} title="User Management">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/40 mb-1">Force Password Reset</label>
              <div className="flex gap-2">
                <input placeholder="Employee ID" value={resetId} onChange={e => setResetId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
                <button onClick={() => resetMut.mutate(resetId)} disabled={!resetId || resetMut.isPending} className="shrink-0 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap">{resetMut.isPending ? 'Resetting...' : 'Reset'}</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/40 mb-1">Deactivate User</label>
              <div className="flex gap-2">
                <input placeholder="Employee ID" value={deactivateId} onChange={e => setDeactivateId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
                <button onClick={() => deactMut.mutate(deactivateId)} disabled={!deactivateId || deactMut.isPending} className="shrink-0 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap">
                  <UserX className="h-3.5 w-3.5" /> Deactivate
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-white/40 mb-1">Reactivate User</label>
              <div className="flex gap-2">
                <input placeholder="Employee ID" value={reactivateId} onChange={e => setReactivateId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
                <button onClick={() => reactMut.mutate(reactivateId)} disabled={!reactivateId || reactMut.isPending} className="shrink-0 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1 whitespace-nowrap">
                  <UserCheck className="h-3.5 w-3.5" /> Reactivate
                </button>
              </div>
            </div>
          </div>
        </Section>

        {/* API Rate Limits */}
        <Section icon={Gauge} title="API Rate Limits">
          <div className="space-y-2">
            {rates.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.plan_name ? `Plan: ${r.plan_name}` : 'Custom'}</p>
                </div>
                <div className="text-right text-xs text-gray-500 dark:text-white/40">
                  <p>{r.requests_per_minute}/min · {r.requests_per_hour}/hr</p>
                  <p>{r.requests_per_day}/day · burst: {r.burst_limit}</p>
                </div>
              </div>
            ))}
            {rates.length === 0 && <p className="text-sm text-gray-400">No rate limits configured</p>}
          </div>
        </Section>

        {/* Active Sessions */}
        <Section icon={Users} title="Active Users">
          <div className="max-h-60 overflow-y-auto space-y-1">
            {sess.slice(0, 20).map(s => (
              <div key={s.employee_id} className="flex items-center justify-between py-1.5 text-sm">
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{s.employee_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{s.employee_id}</span>
                </div>
                <span className="text-xs capitalize text-gray-500 dark:text-white/40">{s.role?.replaceAll('_', ' ')}</span>
              </div>
            ))}
            {sess.length === 0 && <p className="text-sm text-gray-400">No active sessions</p>}
          </div>
        </Section>

        {/* Data Exports */}
        <Section icon={Download} title="Data Export Requests">
          <div className="space-y-2">
            {exps.map(e => (
              <div key={e.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{e.export_type?.replaceAll('_', ' ')}</p>
                  <p className="text-xs text-gray-400">By: {e.requested_by} · {new Date(e.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${e.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : e.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                  {e.status}
                </span>
              </div>
            ))}
            {exps.length === 0 && <p className="text-sm text-gray-400">No export requests</p>}
          </div>
          <button onClick={() => exportMut.mutate({ export_type: 'full_backup' })} disabled={exportMut.isPending} className="mt-4 px-4 py-2 text-sm bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 disabled:opacity-50 w-full">
            Request Full Backup
          </button>
        </Section>

        {/* Impersonation Logs */}
        <Section icon={Shield} title="Impersonation History">
          <div className="space-y-2">
            {imps.map(imp => (
              <div key={imp.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">
                    <span className="font-medium">{imp.admin_id}</span>
                    <span className="text-gray-400 mx-1">as</span>
                    <span className="font-medium">{imp.target_user_id}</span>
                  </p>
                  <p className="text-xs text-gray-400">{new Date(imp.started_at).toLocaleString()}{imp.ended_at ? ` — ${new Date(imp.ended_at).toLocaleString()}` : ' (active)'}</p>
                </div>
                {imp.reason && <p className="text-xs text-gray-500 dark:text-white/40 max-w-[150px] truncate" title={imp.reason}>{imp.reason}</p>}
              </div>
            ))}
            {imps.length === 0 && <p className="text-sm text-gray-400">No impersonation sessions</p>}
          </div>
        </Section>
      </div>
    </div>
  );
}
