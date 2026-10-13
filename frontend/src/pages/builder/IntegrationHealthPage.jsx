import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity, Plug, RefreshCw,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import StatTile from '../../components/ui/StatTile';
import { builderService } from '../../services/builder.service';

function StatusDot({ status }) {
  if (status === 'success') return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
  if (status === 'error')   return <span className="inline-block h-2 w-2 rounded-full bg-red-500" />;
  return <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />;
}

function IntegrationCard({ integration, stats, logs, onRetry, retrying }) {
  const [expanded, setExpanded] = useState(false);
  // error_rate is a fraction 0..1 from the API.
  const errorRate = stats ? stats.error_rate : null;
  const errorPct  = errorRate === null ? null : Math.round(errorRate * 100);
  const health = errorRate === null ? 'unknown' : errorRate === 0 ? 'healthy' : errorRate < 0.2 ? 'degraded' : 'unhealthy';

  const healthColor = {
    healthy:   'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10',
    degraded:  'border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10',
    unhealthy: 'border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10',
    unknown:   'border-gray-200 dark:border-white/10',
  };

  const recentLogs = (logs || []).slice(0, 8);

  return (
    <div className={`card overflow-hidden border ${healthColor[health]}`}>
      <button className="flex w-full items-center gap-4 px-5 py-4 text-left" onClick={() => setExpanded(!expanded)}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${integration.is_active ? 'bg-primary-50' : 'bg-gray-100 dark:bg-white/10'}`}>
          <Plug className={`h-4 w-4 ${integration.is_active ? 'text-primary-600' : 'text-gray-400'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{integration.label || integration.name}</p>
            {!integration.is_active && <Badge variant="default">Inactive</Badge>}
          </div>
          <p className="text-xs text-gray-400">{integration.type} &middot; {integration.name}</p>
        </div>
        {stats && (
          <div className="flex items-center gap-4 text-xs">
            <div className="text-center">
              <p className="font-bold text-emerald-600">{stats.success}</p>
              <p className="text-gray-400">ok</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-red-500">{stats.errors}</p>
              <p className="text-gray-400">err</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-700 dark:text-gray-300">{stats.avg_duration_ms ? `${Math.round(stats.avg_duration_ms)}ms` : '\u2014'}</p>
              <p className="text-gray-400">avg</p>
            </div>
            {errorPct > 0 && (
              <Badge variant={errorRate < 0.2 ? 'warning' : 'danger'}>
                {errorPct}% err
              </Badge>
            )}
          </div>
        )}
        {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-white/[0.07] px-5 py-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">Recent Executions</p>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No execution history yet.</p>
          ) : (
            <div className="space-y-1.5">
              {recentLogs.map(log => (
                <div key={log.id} className="flex items-center gap-3 rounded-lg bg-gray-50/80 dark:bg-white/[0.03] px-3 py-2 text-xs">
                  <StatusDot status={log.status} />
                  <span className="text-gray-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
                  <span className={`flex-1 truncate ${log.status === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
                    {log.error || (log.status === 'success' ? 'Success' : log.status)}
                  </span>
                  {log.duration_ms && <span className="text-gray-400">{log.duration_ms}ms</span>}
                  {log.status === 'error' && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => onRetry(log.id)}
                      loading={retrying === log.id}
                      title="Retry"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function IntegrationHealthPage() {
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(null);

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ['integrations-health'],
    queryFn: () => builderService.getIntegrations().then(r => r.data || []),
  });

  // Fetch stats and logs for each integration in parallel
  const statsQueries = useQuery({
    queryKey: ['integrations-stats', integrations.map(i => i.id).join(',')],
    queryFn: async () => {
      if (!integrations.length) return {};
      const entries = await Promise.all(
        integrations.map(async (i) => {
          try {
            const [statsRes, logsRes] = await Promise.all([
              builderService.getIntegrationStats(i.id),
              builderService.getIntegrationLogs(i.id),
            ]);
            return [i.id, { stats: statsRes.data, logs: logsRes.data || [] }];
          } catch {
            return [i.id, { stats: null, logs: [] }];
          }
        })
      );
      return Object.fromEntries(entries);
    },
    enabled: integrations.length > 0,
  });

  const allData = statsQueries.data || {};

  const retryMut = useMutation({
    mutationFn: (logId) => { setRetrying(logId); return builderService.retryIntegrationLog(logId); },
    onSettled: () => {
      setRetrying(null);
      qc.invalidateQueries({ queryKey: ['integrations-stats'] });
    },
  });

  // Summary stats
  const totalIntegrations = integrations.length;
  const activeCount = integrations.filter(i => i.is_active).length;
  const totalErrors = Object.values(allData).reduce((sum, d) => sum + (d.stats?.errors || 0), 0);
  const healthyCount = Object.values(allData).filter(d => d.stats && d.stats.error_rate === 0).length;

  return (
    <div className="min-h-full bg-surface px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <PageHeader
          icon={Activity}
          eyebrow="Builder"
          title="Integration Health"
          subtitle="Monitor integration status, execution history, and retry failures."
          className="!mb-0"
        />

      <BuilderGuide section="/builder/integration-health" />

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total"        value={totalIntegrations} icon={Plug}     tone="primary" />
          <StatTile label="Active"       value={activeCount}       icon={Activity}  tone="emerald" />
          <StatTile label="Healthy"      value={healthyCount}      icon={Activity}  tone="sky" />
          <StatTile label="Total Errors" value={totalErrors}       icon={RefreshCw} tone={totalErrors > 0 ? 'rose' : 'primary'} />
        </div>

        {/* Integration cards */}
        {isLoading || statsQueries.isLoading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : integrations.length === 0 ? (
          <div className="card px-5 py-16 text-center text-sm text-gray-400">
            No integrations configured yet. Create one in the Integration Builder.
          </div>
        ) : (
          <div className="space-y-4">
            {integrations.map(i => (
              <IntegrationCard
                key={i.id}
                integration={i}
                stats={allData[i.id]?.stats}
                logs={allData[i.id]?.logs}
                onRetry={(logId) => retryMut.mutate(logId)}
                retrying={retrying}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
