import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { platformService } from '../../services/platform.service';
import {
  Building2, CheckCircle2, ListChecks, Loader2, Pause, Play, Plus,
  RotateCcw, Search, Sparkles, Trash2, TriangleAlert, UserPlus, Wrench,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { showError, showSuccess, confirmDialog, promptDialog } from '../../utils/dialog';
import TenantOnboardWizard, {
  ProvisioningReport, generatePassword, suggestEmployeeId,
} from './TenantOnboardWizard';
import TenantFeaturesPanel from './TenantFeaturesPanel';

const STATUS_VARIANT = {
  active: 'success', trial: 'warning', suspended: 'danger',
  cancelled: 'default', deleted: 'danger',
};

const PLAN_VARIANT = {
  free: 'default', starter: 'info', professional: 'purple', enterprise: 'primary',
};

const PAGE_SIZE = 20;

/**
 * The setup badge for one tenant row.
 *
 * A tenant row on its own says nothing about whether the workspace behind it
 * works. Before the provisioning engine existed every tenant but the seeded
 * demo one was empty, and the console showed them all identically — so this
 * column is the one that tells an operator whether they can hand the workspace
 * over. `usable` is the narrow question (roles + metadata + an admin: somebody
 * can sign in and see a CRM); `ready` is every step.
 */
function SetupBadge({ readiness, isLoading }) {
  if (isLoading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300" />;
  if (!readiness) return <span className="text-xs text-gray-400">--</span>;
  if (readiness.ready) return <Badge variant="success" dot>Ready</Badge>;
  if (readiness.usable) return <Badge variant="warning" dot>{readiness.completed}/{readiness.total} set up</Badge>;
  return <Badge variant="danger" dot>Needs setup</Badge>;
}

export default function TenantsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showWizard, setShowWizard] = useState(false);
  const [checklistTenant, setChecklistTenant] = useState(null);
  const [featuresTenant, setFeaturesTenant] = useState(null);
  const [provisionTenant, setProvisionTenant] = useState(null);
  const [adminForm, setAdminForm] = useState({ employee_id: '', employee_name: '', email: '', password: '' });

  const { data } = useQuery({
    queryKey: ['platform-tenants', { page, search, status: statusFilter, plan: planFilter }],
    queryFn: () => platformService.listTenants({
      page, limit: PAGE_SIZE,
      search: search || undefined,
      status: statusFilter || undefined,
      plan: planFilter || undefined,
    }),
    staleTime: 30_000,
  });

  const tenants = data?.data || [];
  const pagination = data?.pagination;

  // One readiness probe per visible row. Cheap (counts only) and cached, and it
  // is what drives both the Setup column and the "Finish setup" action.
  const readinessQueries = useQueries({
    queries: tenants.map((t) => ({
      queryKey: ['platform-tenant-readiness', t.id],
      queryFn: () => platformService.getTenantReadiness(t.id),
      staleTime: 30_000,
      enabled: t.status !== 'deleted',
    })),
  });
  const readinessById = Object.fromEntries(
    tenants.map((t, i) => [t.id, { data: readinessQueries[i]?.data?.data, isLoading: readinessQueries[i]?.isLoading }]),
  );

  const onErr = (e) => showError(e?.response?.data?.error?.message || e?.message || 'Operation failed');
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['platform-tenants'] });
    qc.invalidateQueries({ queryKey: ['platform-tenant-readiness'] });
  };

  const suspendMut = useMutation({ mutationFn: ({ id, reason }) => platformService.suspendTenant(id, { reason }), onSuccess: invalidate, onError: onErr });
  const reactivateMut = useMutation({ mutationFn: (id) => platformService.reactivateTenant(id), onSuccess: invalidate, onError: onErr });
  const deleteMut = useMutation({ mutationFn: (id) => platformService.deleteTenant(id), onSuccess: invalidate, onError: onErr });
  const restoreMut = useMutation({ mutationFn: (id) => platformService.restoreTenant(id), onSuccess: invalidate, onError: onErr });
  const changePlanMut = useMutation({ mutationFn: ({ id, plan }) => platformService.changeTenantPlan(id, { plan }), onSuccess: invalidate, onError: onErr });

  const provisionMut = useMutation({
    mutationFn: ({ id, ...d }) => platformService.provisionAdmin(id, d),
    onSuccess: (res) => {
      invalidate();
      setProvisionTenant(null);
      showSuccess(`${res?.data?.employee_id} can now sign in as Super Administrator`);
    },
    onError: onErr,
  });

  /** Re-run only the steps a tenant is still missing. */
  const finishSetupMut = useMutation({
    mutationFn: (id) => platformService.provisionTenant(id, { missing_only: true }),
    onSuccess: (res) => {
      invalidate();
      const result = res?.data;
      setChecklistTenant((t) => (t ? { ...t, lastRun: result } : t));
      const failed = (result?.steps ?? []).filter((s) => s.status === 'failed');
      if (failed.length) showError(`${failed.length} step(s) could not complete: ${failed.map((s) => s.title).join(', ')}`);
      else if (!result?.steps?.length) showSuccess('Nothing left to set up.');
      else showSuccess(`Completed ${result.steps.length} setup step(s).`);
    },
    onError: onErr,
  });

  const openProvisionAdmin = (t) => {
    setProvisionTenant(t);
    // Pre-fill what we can reasonably guess; the operator still sees and can
    // change every value before submitting.
    setAdminForm({
      employee_id: suggestEmployeeId(t.name),
      employee_name: '',
      email: t.billing_email || '',
      password: generatePassword(),
    });
  };

  const checklist = checklistTenant ? readinessById[checklistTenant.id]?.data : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6">
      <PageHeader
        icon={Building2}
        eyebrow="Platform"
        title="Tenant Management"
        subtitle="Create workspaces, track their setup, and manage their lifecycle."
        className="!mb-0"
        actions={(
          <Button onClick={() => setShowWizard(true)} className="shrink-0 whitespace-nowrap">
            <Plus className="h-4 w-4" /> New workspace
          </Button>
        )}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text" placeholder="Search tenants..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </div>
        <select
          value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option><option value="trial">Trial</option>
          <option value="suspended">Suspended</option><option value="deleted">Deleted</option>
        </select>
        <select
          value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white"
        >
          <option value="">All plans</option>
          <option value="free">Free</option><option value="starter">Starter</option>
          <option value="professional">Professional</option><option value="enterprise">Enterprise</option>
        </select>
      </div>

      <TenantOnboardWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        onDone={invalidate}
      />

      <TenantFeaturesPanel
        tenant={featuresTenant}
        onClose={() => setFeaturesTenant(null)}
      />

      {/* Setup checklist */}
      <Modal
        open={Boolean(checklistTenant)}
        onClose={() => setChecklistTenant(null)}
        size="md"
        icon={ListChecks}
        eyebrow="Setup"
        title={checklistTenant?.name ?? ''}
        subtitle="Every step is idempotent — finishing setup only runs what is missing."
        footer={(
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setChecklistTenant(null)}>Close</Button>
            <Button
              onClick={() => finishSetupMut.mutate(checklistTenant.id)}
              loading={finishSetupMut.isPending}
              disabled={checklist?.ready}
            >
              {!finishSetupMut.isPending && <Wrench className="h-4 w-4" />}
              {checklist?.ready ? 'Nothing to do' : 'Finish setup'}
            </Button>
          </div>
        )}
      >
        {checklist ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {checklist.completed} of {checklist.total} steps complete · {checklist.users} user(s)
              {!checklist.usable && (
                <span className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  Nobody can use this workspace yet — it needs its role ladder, its CRM metadata and a first administrator.
                </span>
              )}
            </p>
            <ul className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {checklist.steps.map((s) => (
                <li key={s.key} className="flex items-start gap-2.5 py-2">
                  <span className="mt-0.5 shrink-0">
                    {s.done
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      : <TriangleAlert className="h-4 w-4 text-amber-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">{s.title}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            {checklistTenant?.lastRun?.steps?.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Last run
                </h3>
                <ProvisioningReport steps={checklistTenant.lastRun.steps} />
              </div>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">Loading setup state...</p>
        )}
      </Modal>

      {/* Provision admin */}
      <Modal
        open={Boolean(provisionTenant)}
        onClose={() => setProvisionTenant(null)}
        size="md"
        icon={UserPlus}
        eyebrow="Administrator"
        title="Provision workspace admin"
        subtitle={`First administrator for ${provisionTenant?.name ?? ''}. Created as Super Administrator of that workspace only.`}
        footer={(
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setProvisionTenant(null)}>Cancel</Button>
            <Button
              onClick={() => provisionMut.mutate({ id: provisionTenant.id, ...adminForm })}
              loading={provisionMut.isPending}
              disabled={!/^[A-Z0-9_]{3,20}$/.test(adminForm.employee_id) || !adminForm.employee_name.trim() || adminForm.password.length < 8}
            >
              Create admin
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Employee ID" required value={adminForm.employee_id}
              onChange={(e) => setAdminForm({ ...adminForm, employee_id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
              help="Unique across the whole platform."
            />
            <Input
              label="Full name" required value={adminForm.employee_name}
              onChange={(e) => setAdminForm({ ...adminForm, employee_name: e.target.value })}
            />
          </div>
          <Input
            label="Email" type="email" value={adminForm.email}
            onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
          />
          <Input
            label="Temporary password" required value={adminForm.password}
            onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
            help="Generated for you. Copy it before closing — it is not shown again."
          />
        </div>
      </Modal>

      {/* Tenants table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.04]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-white/[0.06]">
                {['Tenant', 'Plan', 'Status', 'Setup', 'Users', 'Created'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500 dark:text-white/50">{h}</th>
                ))}
                <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500 dark:text-white/50">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
              {tenants.map((t) => {
                const r = readinessById[t.id];
                return (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{t.name}</div>
                      <div className="text-xs text-gray-500 dark:text-white/40">
                        /{t.slug}{t.domain ? ` · ${t.domain}` : ''}
                        {t.industry ? ` · ${String(t.industry).replace(/_/g, ' ')}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={PLAN_VARIANT[t.plan] ?? 'default'} className="capitalize">{t.plan}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[t.status] ?? 'default'} className="capitalize">{t.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {t.status === 'deleted'
                        ? <span className="text-xs text-gray-400">--</span>
                        : (
                          <button
                            type="button" onClick={() => setChecklistTenant(t)}
                            className="rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            title="Open the setup checklist"
                          >
                            <SetupBadge readiness={r?.data} isLoading={r?.isLoading} />
                          </button>
                        )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-white/60">
                      {r?.data ? `${r.data.users} / ${t.max_users}` : t.max_users}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500 dark:text-white/40">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {t.status !== 'deleted' && (
                          <button
                            onClick={() => setFeaturesTenant(t)} title="Features & entitlements"
                            className="rounded-lg p-1.5 text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-500/20"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {t.status !== 'deleted' && !r?.data?.ready && (
                          <button
                            onClick={() => setChecklistTenant(t)} title="Finish setup"
                            className="rounded-lg p-1.5 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                          >
                            <Wrench className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {t.status !== 'deleted' && !r?.data?.steps?.find((s) => s.key === 'admin')?.done && (
                          <button
                            onClick={() => openProvisionAdmin(t)} title="Provision admin"
                            className="rounded-lg p-1.5 text-primary-500 hover:bg-primary-100 dark:hover:bg-primary-500/20"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {t.status !== 'suspended' && t.status !== 'deleted' && (
                          <button
                            onClick={async () => {
                              const reason = await promptDialog({
                                title: `Suspend ${t.name}`,
                                message: 'Everyone in this workspace loses access immediately, including anyone already signed in. Why?',
                                confirmLabel: 'Suspend',
                              });
                              if (reason !== null) suspendMut.mutate({ id: t.id, reason: reason || 'Suspended by platform admin' });
                            }}
                            title="Suspend"
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-500/20"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {t.status === 'suspended' && (
                          <button onClick={() => reactivateMut.mutate(t.id)} title="Reactivate"
                            className="rounded-lg p-1.5 text-green-500 hover:bg-green-100 dark:hover:bg-green-500/20">
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {t.status === 'deleted' && (
                          <button onClick={() => restoreMut.mutate(t.id)} title="Restore"
                            className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-500/20">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {t.status !== 'deleted' && (
                          <>
                            <select
                              onChange={(e) => { if (e.target.value) changePlanMut.mutate({ id: t.id, plan: e.target.value }); e.target.value = ''; }}
                              defaultValue="" title="Change plan"
                              className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-white/50"
                            >
                              <option value="" disabled>Change plan</option>
                              {['free', 'starter', 'professional', 'enterprise'].filter((p) => p !== t.plan).map((p) => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            <button
                              onClick={async () => {
                                if (await confirmDialog({
                                  title: `Delete ${t.name}`,
                                  message: 'The workspace is marked deleted and everyone in it loses access. It can be restored for 30 days, after which its data becomes eligible for permanent removal.',
                                  confirmLabel: 'Delete workspace',
                                  tone: 'danger',
                                })) deleteMut.mutate(t.id);
                              }}
                              title="Delete"
                              className="rounded-lg p-1.5 text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {tenants.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No tenants found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-white/[0.06]">
            <p className="text-xs text-gray-500 dark:text-white/40">{pagination.total} total</p>
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => (
                <button
                  key={i} onClick={() => setPage(i + 1)}
                  className={`rounded-lg px-2.5 py-1 text-xs ${page === i + 1 ? 'bg-primary-600 text-on-primary' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5'}`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
