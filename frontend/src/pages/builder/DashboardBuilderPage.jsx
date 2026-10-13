import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { builderService } from '../../services/builder.service';
import { useBuilderStore } from '../../store/builderStore';
import DashboardBuilder from '../../components/builder/DashboardBuilder';
import BuilderGuide from '../../components/builder/BuilderGuide';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';

export default function DashboardBuilderPage() {
  const { dashId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setCurrentDashboard, currentDashboard } = useBuilderStore();

  const isNew = !dashId;

  // All dashboards for the toolbar selector
  const { data: dashListData } = useQuery({
    queryKey: ['builder-dashboards'],
    queryFn: () => builderService.getDashboards(),
  });
  const allDashboards = dashListData?.data || [];

  // Roles for the "Visible to" dropdown
  const { data: rolesData } = useQuery({
    queryKey: ['builder-roles'],
    queryFn:  () => builderService.getRoles(),
    staleTime: Infinity,
  });
  const roles = rolesData?.data || [];

  // Current dashboard data
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', dashId],
    queryFn: () => builderService.getDashboard(dashId),
    enabled: !isNew,
  });

  useEffect(() => {
    if (data?.data) {
      setCurrentDashboard(data.data);
    }
  }, [data, setCurrentDashboard]);

  // Clear canvas when switching to "New Dashboard"
  useEffect(() => {
    if (isNew) setCurrentDashboard(null);
  }, [isNew, setCurrentDashboard]);

  const deleteMutation = useMutation({
    mutationFn: () => builderService.deleteDashboard(Number(dashId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['builder-dashboards'] });
      navigate('/builder/dashboard', { replace: true });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ dashboard, widgets }) => {
      // 1. Create or update the dashboard record
      let savedId = dashboard?.id;
      if (!savedId) {
        const created = await builderService.createDashboard({
          name:        dashboard?.name        || 'New Dashboard',
          label:       dashboard?.label       || 'New Dashboard',
          description: dashboard?.description || '',
          min_role:    dashboard?.min_role    ?? null,
        });
        savedId = created.data.id;
      } else {
        const { id: _id, widgets: _w, ...dashFields } = dashboard || {};
        await builderService.updateDashboard(savedId, dashFields);
      }

      // 2. Persist widgets — new ones → addWidget, existing → updateWidget
      for (const w of (widgets || [])) {
        const payload = {
          widget_type: w.widget_type,
          title:       w.title       ?? '',
          x:           Number.isFinite(w.x) ? w.x : 0,
          // Newly-dropped widgets carry y: Infinity until the grid lays them
          // out; Infinity serialises to null and the column is NOT NULL.
          y:           Number.isFinite(w.y) ? w.y : 0,
          w:           w.w           ?? 6,
          h:           w.h           ?? 4,
          config:      w.config      ?? null,
          data_source: w.data_source ?? null,
          chart_id:    w.chart_id    ?? null,
          order_index: w.order_index ?? 0,
          is_active:   w.is_active   ?? true,
        };
        if (w._isNew) {
          await builderService.addWidget(savedId, payload);
        } else if (w.id) {
          await builderService.updateWidget(w.id, payload);
        }
      }

      return savedId;
    },
    onSuccess: (savedId) => {
      qc.invalidateQueries({ queryKey: ['builder-dashboards'] });
      qc.invalidateQueries({ queryKey: ['dashboard', String(savedId)] });
      if (isNew) {
        navigate(`/builder/dashboard/${savedId}`, { replace: true });
      }
    },
  });

  const handleSave   = useCallback((payload) => saveMutation.mutate(payload),   [saveMutation]);
  const handleDelete = useCallback(() => deleteMutation.mutate(),                [deleteMutation]);
  const handleUpdateDashboard = useCallback(
    (updates) => setCurrentDashboard({ ...currentDashboard, ...updates }),
    [currentDashboard, setCurrentDashboard],
  );
  const handleSelectDashboard = useCallback(
    (id) => {
      if (!id || id === 'new') navigate('/builder/dashboard');
      else navigate(`/builder/dashboard/${id}`);
    },
    [navigate],
  );

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!isNew && error) {
    return (
      <div className="p-6">
        <Alert variant="error">Failed to load dashboard: {error.message}</Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-5">
        <BuilderGuide section="/builder/dashboard" />
      </div>
      <DashboardBuilder
        onSave={handleSave}
        saving={saveMutation.isPending}
        saveError={saveMutation.error?.message}
        onDelete={handleDelete}
        deleting={deleteMutation.isPending}
        canDelete={!isNew}
        allDashboards={allDashboards}
        roles={roles}
        onUpdateDashboard={handleUpdateDashboard}
        onSelectDashboard={handleSelectDashboard}
      />
    </div>
  );
}
