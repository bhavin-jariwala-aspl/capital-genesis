import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../../services/auth.service';
import {
  Shield, Plus, Edit, Trash2, Users, ChevronRight,
  ChevronDown, GitBranch,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { showError, confirmDialog } from '../../utils/dialog';

// Lower level = more powerful. Color intensity matches power.
const LEVEL_COLOR = {
  1: 'from-amber-500 to-orange-600',
  2: 'from-purple-500 to-violet-600',
  3: 'from-primary-500 to-blue-600',
  4: 'from-blue-500 to-cyan-600',
  5: 'from-gray-500 to-gray-600',
};

function getLevelColor(level) {
  if (level <= 1) return LEVEL_COLOR[1];
  if (level <= 5) return LEVEL_COLOR[level];
  return 'from-gray-400 to-gray-500';
}

const emptyForm = { name: '', label: '', description: '', level: 5 };

export default function RolesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showOrgChart, setShowOrgChart] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['auth-roles'],
    queryFn: authService.getRoles,
    staleTime: 30_000,
  });
  const { data: empData } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: authService.getEmployees,
    staleTime: 60_000,
  });
  const { data: hierData } = useQuery({
    queryKey: ['admin-hierarchy-root'],
    queryFn: () => authService.getHierarchy(),
    enabled: showOrgChart,
    staleTime: 60_000,
  });

  // Preview which roles will shift when creating at a level
  const { data: shiftPreview } = useQuery({
    queryKey: ['role-shift-preview', form.level],
    queryFn: () => authService.previewRoleShift(Number(form.level)),
    enabled: showForm && !editId && Number(form.level) >= 2,
    staleTime: 5_000,
  });

  const roles = Array.isArray(data) ? data : data?.data || [];
  const employees = Array.isArray(empData) ? empData : empData?.data || [];
  const shifts = shiftPreview?.shifts || (Array.isArray(shiftPreview) ? [] : []);

  const onErr = (e) => showError(e?.response?.data?.error?.message || e?.message || 'Operation failed');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth-roles'] });

  const createMut = useMutation({ mutationFn: (d) => authService.createRole(d), onSuccess: () => { invalidate(); closeForm(); }, onError: onErr });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => authService.updateRole(id, d), onSuccess: () => { invalidate(); closeForm(); }, onError: onErr });
  const deleteMut = useMutation({ mutationFn: (id) => authService.deleteRole(id), onSuccess: invalidate, onError: onErr });

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (role) => {
    setForm({ name: role.name, label: role.label, description: role.description || '', level: role.level });
    setEditId(role.id);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (editId) {
      updateMut.mutate({ id: editId, label: form.label, description: form.description, level: Number(form.level) });
    } else {
      createMut.mutate({ ...form, level: Number(form.level) });
    }
  };

  // Group employees by role for the drill-down
  const empByRole = {};
  for (const e of employees) {
    if (!empByRole[e.role]) empByRole[e.role] = [];
    empByRole[e.role].push(e);
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={Shield}
        eyebrow="Builder"
        title="Roles & Hierarchy"
        subtitle="Define custom roles, set access levels, and view the organization chart."
        className="!mb-0"
        actions={(
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowOrgChart(o => !o)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-white/70 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 text-sm font-medium whitespace-nowrap">
            <GitBranch className="h-4 w-4" /> {showOrgChart ? 'Hide' : 'Show'} Org Chart
          </button>
          <button onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 text-sm font-medium whitespace-nowrap">
            <Plus className="h-4 w-4" /> New Role
          </button>
        </div>
        )}
      />

      <BuilderGuide section="/builder/roles" />

      {/* Hierarchy bar */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-5">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider mb-3">Access Hierarchy (higher inherits lower)</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {roles.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2">
              <div className={`px-3 py-1.5 rounded-lg bg-gradient-to-br ${getLevelColor(r.level)} text-white text-xs font-semibold shadow-sm`}>
                L{r.level} {r.label}
              </div>
              {i < roles.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-gray-300 dark:text-white/20" />}
            </div>
          ))}
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none" onClick={closeForm}>
          <div className="relative w-full max-w-md bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{editId ? 'Edit Role' : 'Create Role'}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Name (slug)</label>
                <input value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  disabled={!!editId} placeholder="e.g. team_lead"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white disabled:opacity-50 placeholder-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Display Label</label>
                <input value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Team Lead"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Description</label>
                <textarea value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder-gray-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">
                  Access Level (lower = more powerful, 2+)
                </label>
                <div className="flex gap-2">
                  <input type="number" min={2} value={form.level}
                    onChange={e => setForm({ ...form, level: e.target.value })}
                    className="w-20 px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white" />
                  <span className="flex-1 px-3 py-2 text-xs text-gray-400 dark:text-white/30 leading-relaxed">
                    {Number(form.level) <= 2 ? 'Full system access' :
                     Number(form.level) <= 3 ? 'Admin (configure system)' :
                     Number(form.level) <= 4 ? 'Team/hierarchy scoped' :
                     Number(form.level) <= 5 ? 'Own records only' :
                     'Custom restricted level'}
                  </span>
                </div>
              </div>

              {/* Shift preview — shown only for new roles when existing roles will be affected */}
              {!editId && shifts.length > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                    Inserting at level {form.level} will shift {shifts.length} existing role{shifts.length !== 1 ? 's' : ''} down:
                  </p>
                  <div className="space-y-1">
                    {shifts.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-300">
                        <span className="font-medium">{s.label}</span>
                        <span className="text-amber-400">Level {s.level}</span>
                        <span className="text-amber-400">&rarr;</span>
                        <span className="font-medium">Level {s.new_level}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">Cancel</button>
              <button onClick={handleSubmit}
                disabled={!form.name || !form.label || createMut.isPending || updateMut.isPending}
                className="px-4 py-2 text-sm bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {(createMut.isPending || updateMut.isPending) ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Org Chart */}
      {showOrgChart && (
        <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider mb-4 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary-400" /> Organization Chart
          </h2>
          {hierData ? (
            <OrgTree node={hierData} />
          ) : (
            <p className="text-sm text-gray-400">Loading org chart...</p>
          )}
        </div>
      )}

      {/* Role cards with employee drill-down */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {roles.map(role => (
          <RoleCard
            key={role.id}
            role={role}
            employees={empByRole[role.name] || []}
            onEdit={() => openEdit(role)}
            onDelete={async () => { if (await confirmDialog({ title: 'Delete role', message: `“${role.label}” will be removed. Employees holding it lose its permissions.`, confirmLabel: 'Delete' })) deleteMut.mutate(role.id); }}
            isDeleting={deleteMut.isPending}
          />
        ))}
        {roles.length === 0 && !isLoading && (
          <div className="col-span-full text-center py-12 text-gray-400">No roles defined yet</div>
        )}
      </div>

      {/* Permission matrix */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider mb-4">Permission Scope by Level</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/[0.06]">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase">Capability</th>
                {[2, 3, 4, 5].map(lv => (
                  <th key={lv} className="text-center px-4 py-2 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase whitespace-nowrap">Level {lv}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {[
                ['Full system access', 2],
                ['Configure modules & forms', 3],
                ['Manage users & roles', 3],
                ['View team records', 4],
                ['Manage team records', 4],
                ['View own records', 5],
                ['Create records', 5],
              ].map(([cap, maxLevel]) => (
                <tr key={cap}>
                  <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{cap}</td>
                  {[2, 3, 4, 5].map(lv => (
                    <td key={lv} className="text-center px-4 py-2">
                      {lv <= maxLevel
                        ? <span className="text-green-500 font-bold">&#10003;</span>
                        : <span className="text-gray-300 dark:text-white/10">-</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Role card with expandable employee list */
function RoleCard({ role, employees, onEdit, onDelete, isDeleting }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${getLevelColor(role.level)} flex items-center justify-center shadow-sm shrink-0`}>
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{role.label}</h3>
            <p className="text-xs text-gray-400 font-mono">{role.name} · Level {role.level}</p>
          </div>
        </div>
        <div className="flex gap-1 shrink-0 ml-2">
          <button onClick={onEdit} aria-label={`Edit ${role.label}`}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400">
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} disabled={isDeleting || employees.length > 0}
            aria-label={`Delete ${role.label}`}
            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 text-red-400 disabled:opacity-30">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {role.description && (
        <p className="text-xs text-gray-500 dark:text-white/50 mb-3 line-clamp-2">{role.description}</p>
      )}

      {/* Employee count + expand */}
      <button onClick={() => setExpanded(e => !e)}
        className="flex items-center justify-between w-full pt-3 border-t border-gray-100 dark:border-white/[0.06] text-left group">
        <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-white/60">
          <Users className="h-3 w-3" />
          <span>{employees.length} employee{employees.length !== 1 ? 's' : ''}</span>
        </div>
        {employees.length > 0 && (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>

      {/* Employee list */}
      {expanded && employees.length > 0 && (
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {employees.map(emp => (
            <div key={emp.employee_id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 dark:hover:bg-white/[0.03]">
              <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary-500 to-mid-600 flex items-center justify-center text-on-primary text-[9px] font-bold shrink-0">
                {emp.employee_name?.[0]}
              </div>
              <span className="text-xs text-gray-700 dark:text-white/70 truncate">{emp.employee_name}</span>
              <span className={`text-[10px] ml-auto ${emp.is_active ? 'text-green-500' : 'text-red-400'}`}>
                {emp.is_active ? 'active' : 'inactive'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Recursive org chart tree */
function OrgTree({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children?.length > 0;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 py-1.5">
        {hasChildren ? (
          <button onClick={() => setOpen(o => !o)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/10">
            {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
        ) : (
          <span className="w-[22px]" />
        )}
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary-500 to-mid-600 flex items-center justify-center text-on-primary text-[10px] font-bold shrink-0">
          {node.employee_name?.[0] || '?'}
        </div>
        <div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">{node.employee_name}</span>
          <span className="text-xs text-gray-400 dark:text-white/30 ml-2">{node.role?.replaceAll('_', ' ')}</span>
        </div>
      </div>
      {open && hasChildren && (
        <div className="border-l-2 border-gray-200 dark:border-white/10 ml-[11px]">
          {node.children.map(child => (
            <OrgTree key={child.employee_id} node={child} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}
