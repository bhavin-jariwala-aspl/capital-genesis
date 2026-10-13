import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { builderService } from '../../services/builder.service';
import { metadataService } from '../../services/metadata.service';
import WorkflowBuilder from '../../components/builder/WorkflowBuilder';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import TextArea from '../../components/ui/TextArea';
import Select from '../../components/ui/Select';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { Plus, Pencil, Trash2, Play, GitBranch, Settings, Bell, Clock, CheckSquare, ArrowDown, ChevronDown, Globe, FilePlus, RefreshCw, Shield, Workflow } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import BuilderGuide from '../../components/builder/BuilderGuide';
import { EntityPermissionPanel } from '../../components/builder/PermissionPanel';
import { useForm } from 'react-hook-form';

/**
 * Triggers the engine dispatches, and which of them need an object.
 *
 * Mirrors `WORKFLOW_TRIGGERS` / `OBJECT_BOUND_TRIGGERS` in
 * `backend/src/services/dashboard.service.js`. The form used to list five of
 * the six — `field_changed` was implemented, documented and tested on the
 * server but unreachable from the Builder.
 */
const OBJECT_BOUND_TRIGGERS = ['on_create', 'on_update', 'on_delete', 'field_changed'];

const TRIGGER_OPTIONS = [
  { value: 'on_create',     label: 'When a record is created' },
  { value: 'on_update',     label: 'When a record is updated' },
  { value: 'field_changed', label: 'When a specific field changes' },
  { value: 'on_delete',     label: 'When a record is deleted' },
  { value: 'scheduled',     label: 'On a schedule' },
  { value: 'manual',        label: 'Only when run by hand' },
];

const TRIGGER_LABEL = Object.fromEntries(TRIGGER_OPTIONS.map((t) => [t.value, t.label]));

const TRIGGER_HELP = {
  on_create:     'Fires once, as the record is created. The usual place for assignment, welcome emails and first-touch tasks.',
  on_update:     'Fires on every save. Put a condition first, or the workflow does its work again on each edit.',
  field_changed: 'Fires only when a field you name actually changes. Condition steps can read the previous value, which is how you detect a transition rather than a state.',
  on_delete:     'Fires before the record is removed, so its field values are still readable.',
  scheduled:     'Swept every 60 seconds. With trigger_config.per_record it runs once per live record — the pattern for renewal and follow-up date sweeps.',
  manual:        'Never fires on its own. Run it from the canvas or the API — the safe way to test a chain before making it automatic.',
};

const STEP_OVERVIEW = [
  { icon: Play,        color: 'bg-green-100 text-green-700 border-green-300',   label: 'Trigger',        desc: 'Defines the event that starts the workflow (on_create, on_update, scheduled, etc.)' },
  { icon: GitBranch,  color: 'bg-yellow-100 text-yellow-700 border-yellow-300', label: 'Condition',      desc: 'A guard — execution branches true/false based on a field comparison' },
  { icon: Settings,   color: 'bg-blue-100 text-blue-700 border-blue-300',        label: 'Action',         desc: 'Update a field value on the triggering record' },
  { icon: Bell,       color: 'bg-purple-100 text-purple-700 border-purple-300',  label: 'Notification',   desc: 'Create an in-app notification for a specific employee, a field value, or a role' },
  { icon: Clock,      color: 'bg-gray-100 text-gray-700 border-gray-300',        label: 'Delay',          desc: 'Pause execution for N minutes, hours, or days — persisted, resumed by scheduler' },
  { icon: CheckSquare,color: 'bg-orange-100 text-orange-700 border-orange-300',  label: 'Approval',       desc: 'Halt and notify approvers; continues from on_true (approved) or on_false (rejected)' },
  { icon: Globe,      color: 'bg-teal-100 text-teal-700 border-teal-300',        label: 'Webhook',        desc: 'HTTP POST to an external URL with record data; SSRF-protected, 10 s timeout' },
  { icon: FilePlus,   color: 'bg-primary-100 text-primary-700 border-primary-300',  label: 'Create Record',  desc: 'Create a new record in any object — config.data values support {{field}} interpolation' },
  { icon: RefreshCw,  color: 'bg-pink-100 text-pink-700 border-pink-300',        label: 'Update Related', desc: 'Bulk-update records in another object where link_field matches this record id' },
];

/**
 * The step-type reference for the workflow canvas.
 *
 * The generic "what is this section for" guidance now comes from
 * `<BuilderGuide>`, which every Builder section shares. What stays here is the
 * part that is genuinely specific to workflows and has no equivalent anywhere
 * else: the ten step types, what each one does, and how they chain. The
 * previous version repeated the section overview and a tips list that
 * BuilderGuide now carries for all twenty sections.
 */
function WorkflowStepReference() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          <GitBranch className="h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/80">The ten step types</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-white/40">What each step does, and how a chain fits together</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-gray-200 px-5 pb-5 dark:border-white/[0.07]">
          <p className="mb-3 mt-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            How steps chain together
          </p>
          <div className="flex flex-wrap items-start gap-3">
            {[
              { icon: Play,       color: 'bg-green-100 text-green-700',  label: 'Trigger',   note: 'when?' },
              { icon: GitBranch,  color: 'bg-yellow-100 text-yellow-700', label: 'Condition', note: 'if?' },
              { icon: Settings,   color: 'bg-blue-100 text-blue-700',     label: 'Action',    note: 'do what?' },
              { icon: Bell,       color: 'bg-purple-100 text-purple-700', label: 'Notify',    note: 'tell who?' },
            ].map((step, i, arr) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex items-center gap-3">
                  <div className={`flex min-w-[90px] flex-col items-center gap-1 rounded-xl border border-current/20 px-4 py-2.5 ${step.color}`}>
                    <Icon className="h-4 w-4" />
                    <span className="text-xs font-semibold">{step.label}</span>
                    <span className="text-[10px] opacity-60">{step.note}</span>
                  </div>
                  {i < arr.length - 1 && <ArrowDown className="h-4 w-4 -rotate-90 text-gray-300" />}
                </div>
              );
            })}
          </div>

          <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/40">
            All step types
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STEP_OVERVIEW.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.label} className={`flex items-start gap-2.5 rounded-xl border p-3 ${step.color}`}>
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold">{step.label}</p>
                    <p className="mt-0.5 text-[11px] leading-snug opacity-75">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowList({ onSelect }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState(null);
  const [permTarget, setPermTarget] = useState(null);
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm();

  const { data, isLoading } = useQuery({ queryKey: ['workflows'], queryFn: () => builderService.getWorkflows() });
  const workflows = data?.data || [];

  // A record-triggered workflow is found by (object_id, trigger_type), so the
  // form has to offer the object. Without it every on_create / on_update /
  // on_delete / field_changed workflow built here saved with object_id null and
  // could never match an event — see OBJECT_BOUND_TRIGGERS on the server.
  const { data: objectsData } = useQuery({
    queryKey: ['metadata-objects-all'],
    queryFn: () => metadataService.getObjects(),
    staleTime: 300_000,
  });
  const objects = objectsData?.data || [];
  const objectName = (id) => objects.find((o) => o.id === Number(id))?.label ?? (id ? `#${id}` : '—');

  const triggerType = watch('trigger_type') || 'on_create';
  const needsObject = OBJECT_BOUND_TRIGGERS.includes(triggerType);

  const saveMutation = useMutation({
    mutationFn: (d) => editing ? builderService.updateWorkflow(editing.id, d) : builderService.createWorkflow(d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['workflows'] });
      setModalOpen(false);
      if (!editing) onSelect(res.data);
    },
    onError: (e) => setFormError(e.response?.data?.message || e.message),
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => builderService.deleteWorkflow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  });

  const columns = [
    { key: 'label', header: 'Name', sortable: true, render: (v, row) => v || row.name },
    { key: 'trigger_type', header: 'Trigger', render: (v) => TRIGGER_LABEL[v] ?? v },
    {
      key: 'object_id', header: 'Object',
      render: (v, row) => (
        OBJECT_BOUND_TRIGGERS.includes(row.trigger_type) && !v
          // Legacy rows created before the form asked for an object. They look
          // active and never fire, so say so rather than showing a dash.
          ? <Badge variant="danger" title="A record-triggered workflow with no object is never matched by the engine. Edit it and pick an object.">Not bound — cannot fire</Badge>
          : <span className="text-gray-600 dark:text-white/60">{objectName(v)}</span>
      ),
    },
    { key: 'is_active', header: 'Status', render: v => <Badge variant={v ? 'success' : 'secondary'}>{v ? 'Active' : 'Inactive'}</Badge> },
    {
      key: 'id', header: '', render: (_, row) => (
        <div className="flex gap-2 justify-end">
          <Button size="xs" variant="ghost" onClick={() => onSelect(row)}>Open</Button>
          <button title="Permissions" onClick={() => setPermTarget(row)} className="p-1 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded"><Shield className="w-4 h-4 text-purple-400" /></button>
          <button onClick={() => { setEditing(row); reset(row); setFormError(null); setModalOpen(true); }} className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded"><Pencil className="w-4 h-4 text-gray-500" /></button>
          <button onClick={() => deleteMutation.mutate(row.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <PageHeader
        icon={Workflow}
        eyebrow="Builder"
        title="Workflow Builder"
        subtitle="Automate actions when records are created, updated, or reach a stage."
        className="!mb-4"
        actions={(
          <Button onClick={() => { setEditing(null); reset({}); setFormError(null); setModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />New Workflow
          </Button>
        )}
      />

      <BuilderGuide section="/builder/workflow" />

      <WorkflowStepReference />

      <DataTable icon={Workflow} title="Workflows" columns={columns} data={workflows} loading={isLoading} />

      <Modal
        isOpen={!!permTarget}
        onClose={() => setPermTarget(null)}
        title={`Permissions — ${permTarget?.label || permTarget?.name || ''}`}
        size="md"
      >
        {permTarget && (
          <EntityPermissionPanel entityType="workflow" entityId={permTarget.id} />
        )}
      </Modal>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Workflow' : 'New Workflow'}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="wf-form" loading={isSubmitting}>Save</Button></div>}>
        {formError && <Alert variant="error" className="mb-3">{formError}</Alert>}
        <form id="wf-form" onSubmit={handleSubmit(d => saveMutation.mutate(d))} className="space-y-3">
          <Input
            label="Name" required
            error={errors.name?.message}
            help="Used in logs and by the API. Lower-case with underscores reads best."
            {...register('name', { required: 'A workflow needs a name' })}
          />
          <Input label="Label (Display Name)" placeholder="Defaults to Name if blank" {...register('label')} />

          <Select
            label="Trigger" required
            options={TRIGGER_OPTIONS}
            help={TRIGGER_HELP[triggerType]}
            {...register('trigger_type', { required: true })}
          />

          {needsObject ? (
            <Select
              label="Object" required
              placeholder="Choose the object this watches…"
              options={objects.map((o) => ({ value: o.id, label: `${o.label}${o.module?.label ? ` — ${o.module.label}` : ''}` }))}
              error={errors.object_id?.message}
              help="A record-triggered workflow is matched by object. Without one it can never fire."
              {...register('object_id', { required: 'Pick the object whose records this workflow watches' })}
            />
          ) : (
            <p className="rounded-lg bg-gray-50 p-2.5 text-xs text-gray-500 dark:bg-white/5 dark:text-gray-400">
              A <strong>{TRIGGER_LABEL[triggerType]}</strong> workflow is not bound to one object, so there is
              nothing to pick here.
            </p>
          )}

          <TextArea label="Description" help="Why this automation exists. The next admin will thank you." {...register('description')} rows={2} />
        </form>
      </Modal>
    </div>
  );
}

export default function WorkflowBuilderPage() {
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);

  if (selectedWorkflow) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-white/[0.07] flex items-center gap-3 bg-white dark:bg-night-1">
          <button onClick={() => setSelectedWorkflow(null)} className="text-primary-600 hover:underline text-sm">← Workflows</button>
          <span className="text-gray-400 dark:text-white/30">/</span>
          <span className="font-medium text-gray-800 dark:text-white/80">{selectedWorkflow.label || selectedWorkflow.name}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <WorkflowBuilder workflowId={selectedWorkflow.id} workflowData={selectedWorkflow} />
        </div>
      </div>
    );
  }

  return <WorkflowList onSelect={setSelectedWorkflow} />;
}
