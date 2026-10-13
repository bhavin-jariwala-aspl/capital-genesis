import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '../../services/auth.service';
import {
  Plus, Edit, UserX, UserCheck, Search, ChevronDown, ChevronRight, GitBranch, Users,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { showError, confirmDialog } from '../../utils/dialog';

const ROLE_BADGE = {
  platform_admin: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400',
  super_admin:    'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
  admin:          'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-400',
  manager:        'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  user:           'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400',
};

const emptyForm = {
  employee_id: '', employee_name: '', role: 'user', email: '', phone: '',
  password: '', parent_id: '', branch_id: '', region_id: '',
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showHierarchy, setShowHierarchy] = useState(null);

  const { data: empData, isLoading } = useQuery({
    queryKey: ['admin-employees'],
    queryFn: authService.getEmployees,
    staleTime: 30_000,
  });
  const { data: rolesData } = useQuery({ queryKey: ['auth-roles'], queryFn: authService.getRoles, staleTime: 300_000 });
  const { data: branchData } = useQuery({ queryKey: ['auth-branches'], queryFn: authService.getBranches, staleTime: 300_000 });
  const { data: hierData } = useQuery({
    queryKey: ['admin-hierarchy', showHierarchy],
    queryFn: () => authService.getHierarchy(showHierarchy),
    enabled: !!showHierarchy,
    staleTime: 60_000,
  });

  const employees = Array.isArray(empData) ? empData : empData?.data || [];
  const roles = (Array.isArray(rolesData) ? rolesData : rolesData?.data || []).filter(r => r.name !== 'platform_admin');
  const branches = Array.isArray(branchData) ? branchData : branchData?.data || [];

  const onErr = (e) => showError(e?.response?.data?.error?.message || e?.message || 'Operation failed');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin-employees'] });

  const createMut = useMutation({ mutationFn: (d) => authService.createEmployee(d), onSuccess: () => { invalidate(); closeForm(); }, onError: onErr });
  const updateMut = useMutation({ mutationFn: ({ id, ...d }) => authService.updateEmployee(id, d), onSuccess: () => { invalidate(); closeForm(); }, onError: onErr });
  const deactMut = useMutation({ mutationFn: (id) => authService.deactivateEmployee(id), onSuccess: invalidate, onError: onErr });
  const reactMut = useMutation({ mutationFn: (id) => authService.reactivateEmployee(id), onSuccess: invalidate, onError: onErr });

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(emptyForm); };

  const openEdit = (emp) => {
    setForm({
      employee_id: emp.employee_id,
      employee_name: emp.employee_name,
      role: emp.role,
      email: emp.email || '',
      phone: emp.phone || '',
      password: '',
      parent_id: '',
      branch_id: emp.branch?.branch_id || '',
      region_id: emp.region?.region_id || '',
    });
    setEditId(emp.employee_id);
    setShowForm(true);
  };

  const openCreate = () => { setForm(emptyForm); setEditId(null); setShowForm(true); };

  const handleSubmit = () => {
    const payload = { ...form };
    if (!payload.password && editId) delete payload.password;
    if (!payload.branch_id) delete payload.branch_id; else payload.branch_id = Number(payload.branch_id);
    if (!payload.region_id) delete payload.region_id; else payload.region_id = Number(payload.region_id);
    if (!payload.parent_id) delete payload.parent_id;
    if (editId) {
      const { employee_id: _, ...rest } = payload;
      updateMut.mutate({ id: editId, ...rest });
    } else {
      createMut.mutate(payload);
    }
  };

  const filtered = search
    ? employees.filter(e =>
        e.employee_id.toLowerCase().includes(search.toLowerCase()) ||
        e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
        (e.email || '').toLowerCase().includes(search.toLowerCase()))
    : employees;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        icon={Users}
        eyebrow="Builder"
        title="Employee Management"
        subtitle="Create, edit, and manage users and their reporting hierarchy."
        className="!mb-0"
        actions={(
          <button onClick={openCreate} className="shrink-0 flex items-center gap-2 px-4 py-2 bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 text-sm font-medium whitespace-nowrap">
            <Plus className="h-4 w-4" /> New Employee
          </button>
        )}
      />

      <BuilderGuide section="/builder/employees" />

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search by ID, name, or email..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder-gray-400" />
      </div>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none" onClick={closeForm}>
          <div className="relative w-full max-w-lg bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {editId ? `Edit ${editId}` : 'Create Employee'}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Employee ID</label>
                  <input value={form.employee_id}
                    onChange={e => setForm({ ...form, employee_id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                    disabled={!!editId}
                    placeholder="e.g. EMP001"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white disabled:opacity-50 placeholder-gray-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Full Name</label>
                  <input value={form.employee_name}
                    onChange={e => setForm({ ...form, employee_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder-gray-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Email</label>
                  <input type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder-gray-400" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Phone</label>
                  <input value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder-gray-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white">
                    {roles.map(r => <option key={r.name} value={r.name}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">
                    Password {editId && '(leave blank to keep)'}
                  </label>
                  <input type="password" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder={editId ? '••••••••' : ''}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white placeholder-gray-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Reports To</label>
                  <select value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white">
                    <option value="">None (top-level)</option>
                    {employees.filter(e => e.employee_id !== editId).map(e => (
                      <option key={e.employee_id} value={e.employee_id}>{e.employee_name} ({e.employee_id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-white/40 mb-1">Branch</label>
                  <select value={form.branch_id} onChange={e => {
                    const br = branches.find(b => b.branch_id === Number(e.target.value));
                    setForm({ ...form, branch_id: e.target.value, region_id: br?.region_id || form.region_id });
                  }}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white">
                    <option value="">No branch</option>
                    {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">Cancel</button>
              <button onClick={handleSubmit}
                disabled={!form.employee_id || !form.employee_name || (!editId && !form.password) || createMut.isPending || updateMut.isPending}
                className="px-4 py-2 text-sm bg-primary-600 text-on-primary rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {(createMut.isPending || updateMut.isPending) ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hierarchy Modal */}
      {showHierarchy && hierData && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-950/45 dark:bg-black/70 backdrop-blur-md animate-fade-in motion-reduce:animate-none" onClick={() => setShowHierarchy(null)}>
          <div className="relative w-full max-w-md bg-white dark:bg-night-2 border border-gray-200/70 dark:border-white/[0.08] rounded-t-3xl sm:rounded-3xl p-6 shadow-elevated animate-slide-up motion-reduce:animate-none max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary-400" /> Org Chart
            </h2>
            <HierarchyTree node={hierData} />
            <div className="flex justify-end mt-4">
              <button onClick={() => setShowHierarchy(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Table */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/[0.06]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase whitespace-nowrap">Employee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase whitespace-nowrap">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase whitespace-nowrap">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase whitespace-nowrap">Branch</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase whitespace-nowrap">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-white/50 uppercase whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {filtered.map(emp => (
                <tr key={emp.employee_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{emp.employee_name}</div>
                    <div className="text-xs text-gray-500 dark:text-white/40">{emp.employee_id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${ROLE_BADGE[emp.role] || ROLE_BADGE.user}`}>
                      {emp.role?.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-white/60 text-sm">{emp.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-white/60 text-sm">{emp.branch?.branch_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${emp.is_active ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(emp)} aria-label={`Edit ${emp.employee_name}`} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 text-gray-400">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setShowHierarchy(emp.employee_id)} aria-label={`View org chart for ${emp.employee_name}`} className="p-1.5 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-500/20 text-primary-400">
                        <GitBranch className="h-3.5 w-3.5" />
                      </button>
                      {emp.is_active ? (
                        <button onClick={async () => { if (await confirmDialog({ tone: 'warning', title: 'Deactivate employee', message: `${emp.employee_name} will lose access immediately. Their records are kept.`, confirmLabel: 'Deactivate' })) deactMut.mutate(emp.employee_id); }}
                          disabled={deactMut.isPending} aria-label={`Deactivate ${emp.employee_name}`}
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 text-red-400 disabled:opacity-50">
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => reactMut.mutate(emp.employee_id)}
                          disabled={reactMut.isPending} aria-label={`Reactivate ${emp.employee_name}`}
                          className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-500/20 text-green-500 disabled:opacity-50">
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">{isLoading ? 'Loading...' : 'No employees found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Recursive tree component for hierarchy visualization */
function HierarchyTree({ node, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children?.length > 0;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-1.5 group">
        {hasChildren ? (
          <button onClick={() => setOpen(o => !o)} className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-white/10">
            {open ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
        ) : (
          <span className="w-[22px]" />
        )}
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary-500 to-mid-600 flex items-center justify-center text-on-primary text-[10px] font-semibold shrink-0">
          {node.employee_name?.[0] || '?'}
        </div>
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{node.employee_name}</span>
          <span className="text-xs text-gray-400 ml-2">{node.role?.replaceAll('_', ' ')}</span>
        </div>
      </div>
      {open && hasChildren && (
        <div className="border-l border-gray-200 dark:border-white/10 ml-[11px]">
          {node.children.map(child => (
            <HierarchyTree key={child.employee_id} node={child} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}
