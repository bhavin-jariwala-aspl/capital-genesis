import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { OperationalPermissionPanel, EntityPermissionPanel } from '../../components/builder/PermissionPanel';
import { builderService } from '../../services/builder.service';

const OPERATIONAL_TABS = [
  { id: 'task',     label: 'Task Permissions' },
  { id: 'activity', label: 'Activity Permissions' },
  { id: 'record',   label: 'Record Permissions' },
  { id: 'barrier_override', label: 'Barrier Override' },
  { id: 'wall_crossing_decide', label: 'Wall-crossing Decisions' },
];

// ── Dashboard permission panel ────────────────────────────────────────────────
function DashboardPermissionsTab() {
  const [selected, setSelected] = useState(null);
  const { data } = useQuery({
    queryKey: ['builder-dashboards'],
    queryFn:  () => builderService.getDashboards(),
  });
  const dashboards = data?.data || [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Select a dashboard to configure which roles can view it.
        Takes precedence over the legacy &ldquo;Min Role&rdquo; field.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {/* Left: list */}
        <div className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
          {dashboards.length === 0 && (
            <p className="text-sm text-gray-400 italic p-4">No dashboards found.</p>
          )}
          {dashboards.map(d => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 dark:border-white/[0.05] transition-colors
                ${selected?.id === d.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03] text-gray-700 dark:text-white/60'}`}
            >
              {d.label || d.name}
            </button>
          ))}
        </div>
        {/* Right: permission panel */}
        <div className="border border-gray-200 dark:border-white/[0.07] rounded-lg p-4">
          {selected ? (
            <EntityPermissionPanel entityType="dashboard" entityId={selected.id} />
          ) : (
            <p className="text-sm text-gray-400 italic">Select a dashboard on the left.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Workflow permission panel ─────────────────────────────────────────────────
function WorkflowPermissionsTab() {
  const [selected, setSelected] = useState(null);
  const { data } = useQuery({
    queryKey: ['builder-workflows'],
    queryFn:  () => builderService.getWorkflows(),
  });
  const workflows = data?.data || [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Select a workflow to configure which roles can view or trigger it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="border border-gray-200 dark:border-white/[0.07] rounded-lg overflow-hidden">
          {workflows.length === 0 && (
            <p className="text-sm text-gray-400 italic p-4">No workflows found.</p>
          )}
          {workflows.map(w => (
            <button
              key={w.id}
              onClick={() => setSelected(w)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 dark:border-white/[0.05] transition-colors
                ${selected?.id === w.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03] text-gray-700 dark:text-white/60'}`}
            >
              {w.label || w.name}
            </button>
          ))}
        </div>
        <div className="border border-gray-200 dark:border-white/[0.07] rounded-lg p-4">
          {selected ? (
            <EntityPermissionPanel entityType="workflow" entityId={selected.id} />
          ) : (
            <p className="text-sm text-gray-400 italic">Select a workflow on the left.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const SECTION_TABS = [
  { id: 'operational', label: 'Operational (Tasks / Activities / Records)' },
  { id: 'dashboards',  label: 'Dashboards' },
  { id: 'workflows',   label: 'Workflows' },
];

/**
 * PermissionsBuilderPage — unified permission management for admins.
 * Covers: operational scopes (task/activity/record), dashboard metadata perms, workflow metadata perms.
 */
export default function PermissionsBuilderPage() {
  const [section, setSection]     = useState('operational');
  const [activeTab, setActiveTab] = useState('task');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <PageHeader
        icon={Shield}
        eyebrow="Builder"
        title="Permission Management"
        subtitle="Unified permission configuration for all entities — per-field, per-form, per-module/object, per-pipeline, and per-wizard."
      />

      <BuilderGuide section="/builder/permissions" />

      {/* Top-level section tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-white/[0.07] mb-6">
        {SECTION_TABS.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t transition-colors ${
              section === s.id
                ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-400 bg-primary-50/40 dark:bg-primary-900/20'
                : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Operational section */}
      {section === 'operational' && (
        <>
          <div className="flex gap-1 mb-4 border-b border-gray-100 dark:border-white/[0.06]">
            {OPERATIONAL_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 text-xs font-medium rounded-t transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-primary-500 text-primary-700 dark:text-primary-400'
                    : 'text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="bg-white dark:bg-night-2 rounded-xl border border-gray-200 dark:border-white/[0.07] shadow-sm p-6">
            <OperationalPermissionPanel entityType={activeTab} />
          </div>
          <div className="mt-6 border border-primary-100 dark:border-primary-500/20 bg-primary-50 dark:bg-primary-500/10 rounded-lg p-4 text-sm text-primary-700 dark:text-primary-300">
            <p className="font-semibold mb-1">How scopes work</p>
            <ul className="list-disc list-inside space-y-1 text-primary-600 dark:text-primary-400">
              <li><strong>None</strong> — role has no access at all for this action</li>
              <li><strong>Own only</strong> — can only act on records they created or are assigned to</li>
              <li><strong>Team</strong> — own records plus direct reports&apos; records</li>
              <li><strong>Hierarchy</strong> — own records plus all descendants in the org hierarchy</li>
              <li><strong>All</strong> — unrestricted access to every record</li>
            </ul>
            <p className="mt-2 text-xs">super_admin and admin always have full access.</p>
          </div>
        </>
      )}

      {section === 'dashboards' && (
        <div className="bg-white dark:bg-night-2 rounded-xl border border-gray-200 dark:border-white/[0.07] shadow-sm p-6">
          <DashboardPermissionsTab />
        </div>
      )}

      {section === 'workflows' && (
        <div className="bg-white dark:bg-night-2 rounded-xl border border-gray-200 dark:border-white/[0.07] shadow-sm p-6">
          <WorkflowPermissionsTab />
        </div>
      )}
    </div>
  );
}
