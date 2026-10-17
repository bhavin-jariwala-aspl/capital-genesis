import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ShieldAlert, DoorOpen, FileLock2, Plus, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import TextArea from '../../components/ui/TextArea';
import Badge from '../../components/ui/Badge';
import Alert from '../../components/ui/Alert';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import { EmployeePicker, EmployeeMultiPicker, useEmployeeMap } from '../../components/ui/EmployeePicker';
import { accessService } from '../../services/access.service';
import { useAuthStore } from '../../store/authStore';
import { fmtDateTime, fmtDate } from '../../utils/formatters';

/**
 * Access & information barriers.
 *
 *  - Business units   — legal entities / lines of business, and who belongs to
 *                       each (admins). Records tagged with a unit are visible
 *                       only to its members.
 *  - Barrier zones    — private-side walls (Compliance): standing members and
 *                       the live insider list.
 *  - Wall-crossings   — anyone may request to be brought over a wall for a
 *                       reason; Compliance approves for a limited time.
 *  - Audit            — the tamper-evident chain of every access change, with
 *                       a one-click integrity check.
 *
 * The page shows what the server lets the viewer see: tabs a viewer has no
 * right to simply come back empty (403), so there is no separate client-side
 * permission model to drift.
 */
const TABS = [
  { key: 'units', label: 'Business units', icon: Building2 },
  { key: 'zones', label: 'Barrier zones', icon: ShieldAlert },
  { key: 'crossings', label: 'Wall-crossings', icon: DoorOpen },
  { key: 'audit', label: 'Audit chain', icon: FileLock2 },
];

export default function AccessPage() {
  const [tab, setTab] = useState('crossings');
  return (
    <div className="p-6 space-y-5">
      <PageHeader icon={ShieldCheck} eyebrow="Governance" title="Access & barriers"
        subtitle="Business-unit scope, information barriers, wall-crossings and the tamper-evident audit trail." />
      <div className="inline-flex flex-wrap gap-1 rounded-xl bg-gray-100/80 p-1 dark:bg-white/[0.04]">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={clsx('inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium',
              tab === t.key ? 'bg-white text-primary-600 shadow-sm dark:bg-white/10 dark:text-primary-300' : 'text-gray-500 hover:text-gray-700 dark:text-white/40')}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'units' && <UnitsTab />}
      {tab === 'zones' && <ZonesTab />}
      {tab === 'crossings' && <CrossingsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}

const errMsg = (e) => e?.response?.data?.error?.message || e?.message;

/* ── Business units ─────────────────────────────────────────────────────── */
function UnitsTab() {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin)();
  const { data, isLoading } = useQuery({ queryKey: ['business-units'], queryFn: accessService.getUnits });
  const units = data?.data ?? [];
  const [edit, setEdit] = useState(null);
  const [members, setMembers] = useState(null);
  const save = useMutation({
    mutationFn: (u) => (u.id ? accessService.updateUnit(u.id, strip(u)) : accessService.createUnit(strip(u))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['business-units'] }); setEdit(null); },
  });
  const saveMembers = useMutation({
    mutationFn: ({ id, ids }) => accessService.setUnitMembers(id, ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['business-units'] }); setMembers(null); },
  });
  const strip = ({ code, name, legal_name, regulator, licence, base_currency, is_active, id }) =>
    (id ? { name, legal_name, regulator, licence, base_currency, is_active } : { code, name, legal_name, regulator, licence, base_currency, is_active: true });

  return (
    <>
      <DataTable icon={Building2} title="Business units" loading={isLoading} data={units}
        actions={isAdmin && <Button size="sm" onClick={() => setEdit({})}><Plus className="mr-1 h-4 w-4" />New unit</Button>}
        columns={[
          { key: 'code', header: 'Code', render: (v) => <code className="text-xs">{v}</code> },
          { key: 'name', header: 'Name' },
          { key: 'regulator', header: 'Regulator / licence', render: (_, r) => [r.regulator, r.licence].filter(Boolean).join(' · ') || '—' },
          { key: 'base_currency', header: 'Currency' },
          { key: 'members', header: 'Members', render: (m) => (m ?? []).length },
          { key: 'is_active', header: 'Status', render: (v) => <Badge variant={v ? 'success' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge> },
          {
            key: 'id', header: '', render: (_, r) => isAdmin && (
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="ghost" onClick={() => setMembers({ id: r.id, name: r.name, ids: (r.members ?? []).map((m) => m.employee_id) })}>Members</Button>
                <Button size="xs" variant="ghost" onClick={() => setEdit(r)}>Edit</Button>
              </div>
            ),
          },
        ]} />
      {edit && (
        <Modal isOpen onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : 'New business unit'}
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => save.mutate(edit)} loading={save.isPending}>Save</Button></div>}>
          {save.error && <Alert variant="error" className="mb-3">{errMsg(save.error)}</Alert>}
          <div className="space-y-3">
            {!edit.id && <Input label="Code *" placeholder="e.g. LND" value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} />}
            <Input label="Name *" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Input label="Legal name" value={edit.legal_name ?? ''} onChange={(e) => setEdit({ ...edit, legal_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Regulator" value={edit.regulator ?? ''} onChange={(e) => setEdit({ ...edit, regulator: e.target.value })} />
              <Input label="Licence" value={edit.licence ?? ''} onChange={(e) => setEdit({ ...edit, licence: e.target.value })} />
            </div>
            <Input label="Base currency" maxLength={3} value={edit.base_currency ?? ''} onChange={(e) => setEdit({ ...edit, base_currency: e.target.value.toUpperCase() })} />
          </div>
        </Modal>
      )}
      {members && (
        <Modal isOpen onClose={() => setMembers(null)} title={`Members — ${members.name}`}
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setMembers(null)}>Cancel</Button><Button onClick={() => saveMembers.mutate(members)} loading={saveMembers.isPending}>Save</Button></div>}>
          <p className="mb-3 text-xs text-gray-500">Non-admin members see this unit&apos;s records plus records with no unit. An employee in no unit is unrestricted.</p>
          <EmployeeMultiPicker label="Employees" value={members.ids} onChange={(ids) => setMembers({ ...members, ids })} />
        </Modal>
      )}
    </>
  );
}

/* ── Barrier zones ──────────────────────────────────────────────────────── */
function ZonesTab() {
  const qc = useQueryClient();
  const names = useEmployeeMap();
  const { data, isLoading, error } = useQuery({ queryKey: ['barrier-zones-admin'], queryFn: accessService.getZones });
  const zones = data?.data ?? [];
  const [edit, setEdit] = useState(null);
  const [insiders, setInsiders] = useState(null);
  const [adding, setAdding] = useState({});
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['barrier-zones-admin'] }); qc.invalidateQueries({ queryKey: ['barrier-zones'] }); };
  const save = useMutation({
    mutationFn: (z) => (z.id ? accessService.updateZone(z.id, { name: z.name, description: z.description, is_active: z.is_active }) : accessService.createZone({ code: z.code, name: z.name, description: z.description })),
    onSuccess: () => { invalidate(); setEdit(null); },
  });
  const add = useMutation({ mutationFn: ({ id, emp }) => accessService.addZoneMember(id, emp), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: ({ id, emp }) => accessService.removeZoneMember(id, emp), onSuccess: invalidate });
  const insiderQuery = useQuery({ queryKey: ['insiders', insiders], queryFn: () => accessService.getInsiders(insiders), enabled: !!insiders });

  const canManage = zones.some((z) => Array.isArray(z.members));
  return (
    <>
      {error && <Alert variant="error">{errMsg(error)}</Alert>}
      {!canManage && !isLoading && <Alert variant="info">Zone membership is managed by Compliance. You can request access from the Wall-crossings tab.</Alert>}
      <div className="flex justify-end">{canManage && <Button size="sm" onClick={() => setEdit({})}><Plus className="mr-1 h-4 w-4" />New zone</Button>}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {zones.map((z) => (
          <div key={z.id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{z.name} <code className="ml-1 text-xs text-gray-400">{z.code}</code></h3>
                {z.description && <p className="mt-1 text-xs text-gray-500">{z.description}</p>}
              </div>
              {canManage && (
                <div className="flex gap-1">
                  <Button size="xs" variant="ghost" onClick={() => setInsiders(z.id)}>Insider list</Button>
                  <Button size="xs" variant="ghost" onClick={() => setEdit(z)}>Edit</Button>
                </div>
              )}
            </div>
            {canManage && (
              <>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {(z.members ?? []).map((m) => (
                    <li key={m.employee_id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-white/10">
                      {names.get(m.employee_id) ?? m.employee_id}
                      {m.source === 'wall_crossing' && <span className="text-amber-600" title={`Until ${fmtDate(m.valid_to)}`}>· crossing</span>}
                      <button type="button" aria-label="Remove" onClick={() => remove.mutate({ id: z.id, emp: m.employee_id })}><XCircle className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" /></button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-end gap-2">
                  <EmployeePicker label="Add standing member" value={adding[z.id] ?? ''} onChange={(v) => setAdding({ ...adding, [z.id]: v })} wrapperClass="flex-1" />
                  <Button size="sm" disabled={!adding[z.id]} onClick={() => add.mutate({ id: z.id, emp: adding[z.id] })}>Add</Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {edit && (
        <Modal isOpen onClose={() => setEdit(null)} title={edit.id ? `Edit ${edit.name}` : 'New barrier zone'}
          footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => save.mutate(edit)} loading={save.isPending}>Save</Button></div>}>
          {save.error && <Alert variant="error" className="mb-3">{errMsg(save.error)}</Alert>}
          <div className="space-y-3">
            {!edit.id && <Input label="Code *" placeholder="e.g. ADV_PRIVATE" value={edit.code ?? ''} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} />}
            <Input label="Name *" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <TextArea label="Description" rows={2} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </div>
        </Modal>
      )}
      {insiders && (
        <Modal isOpen size="lg" onClose={() => setInsiders(null)} title="Insider list">
          <DataTable icon={FileLock2} title="Everyone currently inside the wall" loading={insiderQuery.isLoading}
            data={insiderQuery.data?.data ?? []}
            columns={[
              { key: 'employee', header: 'Employee', render: (e) => e?.employee_name },
              { key: 'source', header: 'Basis', render: (v) => (v === 'wall_crossing' ? 'Wall-crossing' : 'Standing member') },
              { key: 'created_at', header: 'Since', render: (v) => fmtDateTime(v) },
              { key: 'valid_to', header: 'Until', render: (v) => (v ? fmtDateTime(v) : '—') },
              { key: 'granted_by', header: 'Granted by', render: (v) => names.get(v) ?? v ?? '—' },
            ]} />
        </Modal>
      )}
    </>
  );
}

/* ── Wall-crossings ─────────────────────────────────────────────────────── */
const CROSSING_STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', expired: 'Expired' };

function CrossingsTab() {
  const qc = useQueryClient();
  const names = useEmployeeMap();
  const me = useAuthStore((s) => s.employee);
  const zones = useQuery({ queryKey: ['barrier-zones'], queryFn: accessService.getZones });
  const list = useQuery({ queryKey: ['wall-crossings'], queryFn: () => accessService.getCrossings(), retry: false });
  const [req, setReq] = useState({ zone_id: '', reason: '', employee_id: '' });
  const request = useMutation({
    mutationFn: () => accessService.requestCrossing({ zone_id: Number(req.zone_id), reason: req.reason, ...(req.employee_id ? { employee_id: req.employee_id } : {}) }),
    onSuccess: () => { setReq({ zone_id: '', reason: '', employee_id: '' }); qc.invalidateQueries({ queryKey: ['wall-crossings'] }); },
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }) => accessService.decideCrossing(id, approve, 30),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wall-crossings'] }),
  });
  const isCompliance = !list.error;

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
        <h3 className="font-semibold text-gray-900 dark:text-white">Request a wall-crossing</h3>
        <p className="text-xs text-gray-500">Explain why you (or a colleague) need inside information. Compliance approves for a limited time and you are added to the insider list.</p>
        <Select label="Zone" value={req.zone_id} onChange={(e) => setReq({ ...req, zone_id: e.target.value })}
          options={[{ value: '', label: 'Select…' }, ...(zones.data?.data ?? []).map((z) => ({ value: String(z.id), label: z.name }))]} />
        <EmployeePicker label="For (leave empty for yourself)" value={req.employee_id} onChange={(v) => setReq({ ...req, employee_id: v })} />
        <TextArea label="Reason *" rows={3} value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} />
        {request.error && <Alert variant="error">{errMsg(request.error)}</Alert>}
        {request.isSuccess && <Alert variant="success">Request sent to Compliance.</Alert>}
        <Button disabled={!req.zone_id || req.reason.trim().length < 5} loading={request.isPending} onClick={() => request.mutate()}>Submit request</Button>
      </div>
      {isCompliance ? (
        <DataTable icon={DoorOpen} title="Requests" loading={list.isLoading} data={list.data?.data ?? []}
          columns={[
            { key: 'zone', header: 'Zone', render: (z) => z?.name },
            { key: 'employee', header: 'Who', render: (e, r) => e?.employee_name ?? r.employee_id },
            { key: 'reason', header: 'Reason', render: (v) => <span className="line-clamp-2 text-xs">{v}</span> },
            { key: 'requested_by', header: 'Asked by', render: (v) => names.get(v) ?? v ?? '—' },
            { key: 'status', header: 'Status', render: (v, r) => <Badge variant={{ approved: 'success', rejected: 'danger', pending: 'warning' }[v] ?? 'secondary'}>{CROSSING_STATUS[v] ?? v}{r.valid_to && v === 'approved' ? ` · until ${fmtDate(r.valid_to)}` : ''}</Badge> },
            {
              // Never the requester, and never a crossing for yourself (the server refuses both).
              key: 'id', header: '', render: (id, r) => r.status === 'pending' && r.requested_by !== me?.employee_id && r.employee_id !== me?.employee_id && (
                <div className="flex justify-end gap-1">
                  <Button size="xs" onClick={() => decide.mutate({ id, approve: true })}><CheckCircle2 className="mr-1 h-3 w-3" />Approve 30d</Button>
                  <Button size="xs" variant="ghost" onClick={() => decide.mutate({ id, approve: false })}>Reject</Button>
                </div>
              ),
            },
          ]} />
      ) : (
        <Alert variant="info">Requests are reviewed by Compliance; you will be notified of the decision.</Alert>
      )}
    </div>
  );
}

/* ── Audit chain ────────────────────────────────────────────────────────── */
function AuditTab() {
  const names = useEmployeeMap();
  const list = useQuery({ queryKey: ['audit-chain'], queryFn: () => accessService.getAuditChain({ limit: 200 }), retry: false });
  const verify = useMutation({ mutationFn: accessService.verifyAuditChain });
  if (list.error) return <Alert variant="info">The audit chain is available to Compliance and administrators.</Alert>;
  const v = verify.data?.data;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => verify.mutate()} loading={verify.isPending}><ShieldCheck className="mr-1 h-4 w-4" />Verify integrity</Button>
        {v && (v.ok
          ? <Badge variant="success">Intact — {v.events} events verified</Badge>
          : <Badge variant="danger">Broken at event #{v.broken_at}: {v.reason}</Badge>)}
      </div>
      <DataTable icon={FileLock2} title="Tamper-evident audit chain" loading={list.isLoading} data={list.data?.data ?? []}
        columns={[
          { key: 'seq', header: '#' },
          { key: 'created_at', header: 'When', render: (val) => fmtDateTime(val) },
          { key: 'actor', header: 'Who', render: (val) => names.get(val) ?? val ?? 'system' },
          { key: 'entity_type', header: 'What', render: (val, r) => <span className="text-xs">{val}{r.entity_id ? ` #${r.entity_id}` : ''}</span> },
          { key: 'action', header: 'Action' },
          { key: 'sensitivity', header: '', render: (val) => val === 'sensitive' && <Badge variant="warning">sensitive</Badge> },
          { key: 'hash', header: 'Hash', render: (val) => <code className="text-[10px] text-gray-400">{val?.slice(0, 12)}…</code> },
        ]} />
    </div>
  );
}
