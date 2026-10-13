import { useQuery } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import {
  Building2, Users, Database, Activity, TrendingUp, DollarSign,
  Shield, Server, AlertTriangle, CheckCircle,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile, { toneForColor } from '../../components/ui/StatTile';

/** Thin adapter — keeps existing call sites but renders the shared StatTile widget. */
function StatCard({ icon, label, value, sub, color = 'indigo' }) {
  return <StatTile icon={icon} label={label} value={value ?? '—'} sub={sub} tone={toneForColor(color)} />;
}

export default function PlatformDashboard() {
  const { data: overview } = useQuery({
    queryKey: ['platform-overview'],
    queryFn: platformService.getOverview,
    staleTime: 60_000,
  });
  const { data: health } = useQuery({
    queryKey: ['platform-health'],
    queryFn: platformService.getSystemHealth,
    staleTime: 30_000,
  });
  const { data: revenue } = useQuery({
    queryKey: ['platform-revenue'],
    queryFn: platformService.getRevenue,
    staleTime: 60_000,
  });
  const { data: churn } = useQuery({
    queryKey: ['platform-churn'],
    queryFn: () => platformService.getChurn({ months: 6 }),
    staleTime: 120_000,
  });

  const stats = overview?.data;
  const sys = health?.data;
  const rev = revenue?.data;
  const ch = churn?.data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <PageHeader
        icon={Shield}
        eyebrow="Platform"
        title="Platform Administration"
        subtitle="Super Administrator dashboard — manage tenants, security, features, and platform health."
        className="!mb-0"
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon={Building2} label="Tenants" value={stats?.tenants?.total} sub={`${stats?.tenants?.active || 0} active`} color="indigo" />
        <StatCard icon={Users} label="Users" value={stats?.users?.total} sub={`${stats?.users?.active || 0} active`} color="blue" />
        <StatCard icon={Database} label="Records" value={stats?.data?.records?.toLocaleString()} color="green" />
        <StatCard icon={Activity} label="Activities" value={stats?.data?.activities?.toLocaleString()} color="purple" />
        <StatCard icon={DollarSign} label="MRR" value={rev ? `$${rev.mrr?.toLocaleString()}` : '—'} sub={rev ? `ARR: $${rev.arr?.toLocaleString()}` : ''} color="amber" />
        <StatCard icon={AlertTriangle} label="Churn" value={ch?.total_churned} sub={`${ch?.period_months || 6}mo period`} color="red" />
      </div>

      {/* System Health & Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Server className="h-5 w-5 text-green-400" /> System Health
          </h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.06]">
              <span className="text-sm text-gray-600 dark:text-white/60">Database</span>
              <span className={`text-sm font-medium flex items-center gap-1.5 ${sys?.database?.status === 'connected' ? 'text-green-500' : 'text-red-500'}`}>
                <CheckCircle className="h-3.5 w-3.5" /> {sys?.database?.status || '—'} ({sys?.database?.latency_ms || 0}ms)
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.06]">
              <span className="text-sm text-gray-600 dark:text-white/60">Uptime</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {sys?.uptime ? `${Math.floor(sys.uptime / 3600)}h ${Math.floor((sys.uptime % 3600) / 60)}m` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.06]">
              <span className="text-sm text-gray-600 dark:text-white/60">Memory (Heap)</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {sys?.memory?.heapUsed ? `${Math.round(sys.memory.heapUsed / 1048576)}MB` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-600 dark:text-white/60">Node.js</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{sys?.node_version || '—'}</span>
            </div>
          </div>
        </div>

        {/* Revenue Breakdown */}
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-400" /> Revenue by Plan
          </h2>
          <div className="mt-4 space-y-3">
            {rev?.breakdown?.map((p) => (
              <div key={p.plan} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.06] last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{p.label}</span>
                  <span className="text-xs text-gray-500 dark:text-white/40 ml-2">{p.tenants} tenant(s)</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">${p.mrr?.toLocaleString()}/mo</span>
                  <span className="text-xs text-gray-500 dark:text-white/40 ml-2">${p.price_monthly}/user</span>
                </div>
              </div>
            )) || <p className="text-sm text-gray-400">No data</p>}
          </div>
        </div>
      </div>

      {/* Tenants by Plan & Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary-400" /> Tenants by Plan
          </h2>
          <div className="mt-4 space-y-2">
            {stats?.tenants?.by_plan && Object.entries(stats.tenants.by_plan).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between py-1.5">
                <span className="text-sm capitalize text-gray-700 dark:text-white/70">{plan}</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-white/10 px-2.5 py-0.5 rounded-full">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" /> Tenants by Status
          </h2>
          <div className="mt-4 space-y-2">
            {stats?.tenants?.by_status && Object.entries(stats.tenants.by_status).map(([status, count]) => {
              const statusColor = { active: 'text-green-500', suspended: 'text-red-500', trial: 'text-amber-500', cancelled: 'text-gray-500', deleted: 'text-red-700' };
              return (
                <div key={status} className="flex items-center justify-between py-1.5">
                  <span className={`text-sm capitalize font-medium ${statusColor[status] || 'text-gray-700 dark:text-white/70'}`}>{status}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-white/10 px-2.5 py-0.5 rounded-full">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
