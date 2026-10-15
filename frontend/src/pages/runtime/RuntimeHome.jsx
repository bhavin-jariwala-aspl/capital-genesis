import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { runtimeService } from '../../services/metadata.service';
import DashboardRenderer from '../../components/runtime/DashboardRenderer';
import SlaRadiator from '../../components/runtime/SlaRadiator';
import Select from '../../components/ui/Select';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';
import PageHeader from '../../components/ui/PageHeader';
import { useAuthStore } from '../../store/authStore';
import { LayoutDashboard } from 'lucide-react';

function greeting(name) {
  const first = (name || '').split(' ')[0];
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return first ? `${part}, ${first} — here's your day at a glance.` : "Here's your day at a glance.";
}

export default function RuntimeHome() {
  // `?dashboard=<id>` opens a given board (links in guides, bookmarks); picking
  // one from the list updates it, so the address always matches the screen.
  const [params, setParams] = useSearchParams();
  const selectedDashId = Number(params.get('dashboard')) || null;
  const setSelectedDashId = (id) => setParams((p) => { const next = new URLSearchParams(p); next.set('dashboard', String(id)); return next; }, { replace: true });
  const isAdmin = useAuthStore(s => s.isAdmin());
  const employee = useAuthStore(s => s.employee);

  const { data: dashListData, isLoading: dashListLoading } = useQuery({
    queryKey: ['runtime-dashboards'],
    queryFn: () => runtimeService.getDashboards(),
  });
  const dashboards = dashListData?.data || [];

  // A board the viewer cannot see falls back to their first one.
  const defaultDashId = (selectedDashId && dashboards.some((d) => Number(d.id) === selectedDashId) ? selectedDashId : null) || (dashboards.find((d) => d.is_home) ?? dashboards.find((d) => d.is_default) ?? dashboards[0])?.id;

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['runtime-dashboard', defaultDashId],
    queryFn: () => runtimeService.getDashboard(defaultDashId),
    enabled: !!defaultDashId,
  });

  return (
    <div className="h-full overflow-auto">
      {/* SLA information radiator — always on top, actionable, live */}
      <SlaRadiator />

      {/* Dashboard header */}
      <div className="px-6 pt-4">
        <PageHeader
          icon={LayoutDashboard}
          eyebrow="Dashboard"
          title="Welcome back"
          subtitle={greeting(employee?.employee_name)}
          actions={dashboards.length > 1 && (
            <div className="w-52">
              <Select
                options={dashboards.map(d => ({ value: String(d.id), label: d.label }))}
                value={defaultDashId ? String(defaultDashId) : ''}
                onChange={e => setSelectedDashId(Number(e.target.value))}
              />
            </div>
          )}
        />
      </div>

      {dashListLoading || dashLoading ? (
        <div className="flex items-center justify-center p-16">
          <Spinner size="xl" />
        </div>
      ) : !dashData?.data ? (
        <div className="p-6">
          {isAdmin ? (
            <Alert variant="info">No dashboards configured yet. <Link to="/builder/dashboard" className="underline font-medium">Create one in the Builder.</Link></Alert>
          ) : (
            <Alert variant="info">No dashboards are available for your account yet. Please contact your administrator.</Alert>
          )}
        </div>
      ) : (
        <DashboardRenderer dashboard={dashData.data} />
      )}
    </div>
  );
}
