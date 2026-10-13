import { useQuery } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import {
  TrendingUp, Users, Database, Activity,
  DollarSign, AlertTriangle, Zap, BarChart2,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import StatTile, { toneForColor } from '../../components/ui/StatTile';

/** Thin adapter — keeps existing call sites but renders the shared StatTile widget. */
function MetricCard({ icon, label, value, color = 'indigo' }) {
  return <StatTile icon={icon} label={label} value={value ?? '—'} tone={toneForColor(color)} />;
}

function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function AnalyticsPage() {
  const { data: overview } = useQuery({ queryKey: ['platform-overview'], queryFn: platformService.getOverview, staleTime: 60_000 });
  const { data: growth } = useQuery({ queryKey: ['platform-growth', 12], queryFn: () => platformService.getTenantGrowth({ months: 12 }), staleTime: 120_000 });
  const { data: featureUsage } = useQuery({ queryKey: ['platform-feature-usage'], queryFn: platformService.getFeatureUsage, staleTime: 120_000 });
  const { data: userActivity } = useQuery({ queryKey: ['platform-user-activity', 30], queryFn: () => platformService.getUserActivity({ days: 30 }), staleTime: 60_000 });
  const { data: revenue } = useQuery({ queryKey: ['platform-revenue'], queryFn: platformService.getRevenue, staleTime: 60_000 });
  const { data: churn } = useQuery({ queryKey: ['platform-churn'], queryFn: () => platformService.getChurn({ months: 6 }), staleTime: 120_000 });

  const stats = overview?.data;
  const feat = featureUsage?.data;
  const act = userActivity?.data;
  const rev = revenue?.data;
  const ch = churn?.data;
  const gr = growth?.data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={BarChart2}
        eyebrow="Platform"
        title="Platform Analytics"
        subtitle="Adoption metrics, feature usage, revenue, and churn analysis."
        className="!mb-0"
      />

      {/* Top Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Monthly Revenue" value={rev ? `$${rev.mrr?.toLocaleString()}` : undefined} color="amber" />
        <MetricCard icon={TrendingUp} label="Annual Revenue" value={rev ? `$${rev.arr?.toLocaleString()}` : undefined} color="green" />
        <MetricCard icon={AlertTriangle} label="Churned (6mo)" value={ch?.total_churned} color="red" />
        <MetricCard icon={Users} label="Active Users" value={stats?.users?.active} color="blue" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Growth */}
        <Section title="Tenant Growth (12 months)">
          {gr ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {Object.entries(gr).map(([month, data]) => (
                <div key={month} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-white/[0.04] last:border-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{month}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-900 dark:text-white font-semibold">+{data.total}</span>
                    <div className="flex gap-1">
                      {Object.entries(data.by_plan || {}).map(([plan, count]) => (
                        <span key={plan} className="text-xs bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded capitalize text-gray-500 dark:text-white/40">
                          {plan}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {Object.keys(gr).length === 0 && <p className="text-sm text-gray-400">No growth data yet</p>}
            </div>
          ) : <p className="text-sm text-gray-400">Loading...</p>}
        </Section>

        {/* Feature Usage */}
        <Section title="Feature Usage Heatmap">
          {feat ? (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(feat).map(([feature, count]) => {
                const maxCount = Math.max(...Object.values(feat), 1);
                const intensity = Math.round((count / maxCount) * 100);
                return (
                  <div key={feature} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                    <span className="text-sm capitalize text-gray-700 dark:text-white/70">{feature.replace(/_/g, ' ')}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${intensity}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white w-8 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-400">Loading...</p>}
        </Section>

        {/* User Activity */}
        <Section title="User Activity (30 days)">
          {act ? (
            <div className="space-y-3">
              {[
                ['Records Created', act.records_created, Database, 'text-primary-400'],
                ['Activities Logged', act.activities_created, Activity, 'text-blue-400'],
                ['Tasks Completed', act.tasks_completed, Zap, 'text-green-400'],
              ].map(([label, value, Icon, color]) => (
                <div key={label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${color}`} />
                    <span className="text-sm text-gray-700 dark:text-white/70">{label}</span>
                  </div>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{value?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">Loading...</p>}
        </Section>

        {/* Revenue Breakdown */}
        <Section title="Revenue by Plan">
          {rev?.breakdown ? (
            <div className="space-y-3">
              {rev.breakdown.map(p => (
                <div key={p.plan} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.label}</p>
                    <p className="text-xs text-gray-400">{p.tenants} tenant(s) x ${p.price_monthly}/mo</p>
                  </div>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">${p.mrr?.toLocaleString()}</span>
                </div>
              ))}
              <div className="pt-3 border-t border-gray-200 dark:border-white/[0.06] flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700 dark:text-white/70">Total MRR</span>
                <span className="text-xl font-bold text-primary-600 dark:text-primary-400">${rev.mrr?.toLocaleString()}</span>
              </div>
            </div>
          ) : <p className="text-sm text-gray-400">Loading...</p>}
        </Section>

        {/* Churn */}
        <Section title="Churn Indicators (6 months)">
          {ch ? (
            <div className="space-y-3">
              {[
                ['Suspended', ch.suspended, 'amber'],
                ['Deleted', ch.deleted, 'red'],
                ['Expired Trials', ch.expired_trials, 'gray'],
                ['Total Churned', ch.total_churned, 'red'],
              ].map(([label, value, color]) => (
                <div key={label} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/[0.03]">
                  <span className="text-sm text-gray-700 dark:text-white/70">{label}</span>
                  <span className={`text-lg font-bold ${color === 'red' ? 'text-red-500' : color === 'amber' ? 'text-amber-500' : 'text-gray-500 dark:text-white/50'}`}>{value}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">Loading...</p>}
        </Section>
      </div>
    </div>
  );
}
