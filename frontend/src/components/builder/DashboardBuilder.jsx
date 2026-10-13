import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, Eye, EyeOff, Trash2 } from 'lucide-react';
import WidgetPalette  from './WidgetPalette';
import DashboardCanvas from './DashboardCanvas';
import WidgetConfigPanel from './WidgetConfigPanel';
import Button from '../ui/Button';
import { useBuilderStore } from '../../store/builderStore';

export default function DashboardBuilder({ onSave, saving, saveError, onDelete, deleting, canDelete, loading, allDashboards = [], onSelectDashboard, roles = [], onUpdateDashboard }) {
  const { dashboardWidgets, currentDashboard } = useBuilderStore();
  const [previewMode, setPreviewMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isBusy = saving || loading;

  const selectorOptions = [
    { value: 'new',   label: '+ New Dashboard' },
    ...allDashboards.map(d => ({ value: String(d.id), label: d.label || d.name })),
  ];

  const currentValue = currentDashboard?.id ? String(currentDashboard.id) : 'new';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-white dark:bg-night-1 border-b border-gray-200 dark:border-white/[0.07] shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/80">Dashboard Builder</h2>

          {/* Dashboard selector */}
          <select
            value={currentValue}
            onChange={(e) => onSelectDashboard?.(e.target.value)}
            className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 bg-white dark:bg-white/5 text-gray-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-primary-500 min-w-[180px]"
          >
            {selectorOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Visible-to role selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 whitespace-nowrap">Visible to:</span>
            <select
              value={currentDashboard?.min_role ?? ''}
              onChange={(e) => onUpdateDashboard?.({ min_role: e.target.value || null })}
              className="text-sm border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 bg-white dark:bg-white/5 text-gray-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Roles</option>
              {roles.map(r => (
                <option key={r.name} value={r.name}>{r.label}</option>
              ))}
            </select>
          </div>

          <span className="text-xs text-gray-400 dark:text-white/30 bg-gray-100 dark:bg-white/[0.07] px-2 py-0.5 rounded-full">
            {dashboardWidgets.length} widget{dashboardWidgets.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPreviewMode((p) => !p)}
          >
            {previewMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {previewMode ? 'Edit' : 'Preview'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isBusy}
            onClick={() => onSave?.({ dashboard: currentDashboard, widgets: dashboardWidgets })}
          >
            <Save className="h-4 w-4" />
            Save Dashboard
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="px-5 py-2 bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20 text-sm text-red-600 dark:text-red-400">
          Save failed: {saveError}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && createPortal((
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none">
          <div className="relative w-full max-w-sm bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white/90 mb-2">Delete Dashboard?</h3>
            <p className="text-sm text-gray-500 dark:text-white/40 mb-5">
              <span className="font-medium text-gray-700 dark:text-white/70">{currentDashboard?.label || currentDashboard?.name || 'This dashboard'}</span> and all its widgets will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={() => { setConfirmDelete(false); onDelete?.(); }}
              >
                <Trash2 className="h-4 w-4" />
                Delete Dashboard
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {!previewMode && <WidgetPalette />}
        <DashboardCanvas editable={!previewMode} />
        {!previewMode && <WidgetConfigPanel />}
      </div>
    </div>
  );
}
