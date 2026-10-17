import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { builderService } from '../../services/builder.service';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Input from '../ui/Input';
import TextArea from '../ui/TextArea';
import Modal from '../ui/Modal';

import Alert from '../ui/Alert';
import {
  Plus, Trash2, ArrowDown, Play, GitBranch, Bell, BellRing,
  Clock, CheckSquare, Settings, Globe, FilePlus, RefreshCw, Plug, AlertTriangle, Mail, FileText, MessageSquare,
} from 'lucide-react';
import {
  STEP_SCHEMAS, parseStepConfig, validateStepConfig,
} from '../../utils/workflowStepSchema';

const STEP_TYPES = [
  { value: 'trigger',        label: 'Trigger',        icon: Play,        color: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-500/20 dark:border-green-500/40 dark:text-green-400' },
  { value: 'condition',      label: 'Condition',      icon: GitBranch,   color: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-500/20 dark:border-yellow-500/40 dark:text-yellow-400' },
  { value: 'action',         label: 'Action',         icon: Settings,    color: 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-500/20 dark:border-blue-500/40 dark:text-blue-400' },
  { value: 'notification',   label: 'Notification',   icon: Bell,        color: 'bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-500/20 dark:border-purple-500/40 dark:text-purple-400' },
  { value: 'delay',          label: 'Delay',          icon: Clock,       color: 'bg-gray-100 border-gray-400 text-gray-800 dark:bg-gray-500/20 dark:border-gray-500/40 dark:text-gray-400' },
  { value: 'approval',       label: 'Approval',       icon: CheckSquare, color: 'bg-orange-100 border-orange-400 text-orange-800 dark:bg-orange-500/20 dark:border-orange-500/40 dark:text-orange-400' },
  { value: 'webhook',        label: 'Webhook',        icon: Globe,       color: 'bg-teal-100 border-teal-400 text-teal-800 dark:bg-teal-500/20 dark:border-teal-500/40 dark:text-teal-400' },
  { value: 'integration',    label: 'Integration',    icon: Plug,        color: 'bg-cyan-100 border-cyan-400 text-cyan-800 dark:bg-cyan-500/20 dark:border-cyan-500/40 dark:text-cyan-400' },
  { value: 'create_record',  label: 'Create Record',  icon: FilePlus,    color: 'bg-primary-100 border-primary-400 text-primary-800 dark:bg-primary-500/20 dark:border-primary-500/40 dark:text-primary-400' },
  { value: 'update_related', label: 'Update Related', icon: RefreshCw,   color: 'bg-pink-100 border-pink-400 text-pink-800 dark:bg-pink-500/20 dark:border-pink-500/40 dark:text-pink-400' },
  { value: 'send_email',     label: 'Send Email',     icon: Mail,        color: 'bg-sky-100 border-sky-400 text-sky-800 dark:bg-sky-500/20 dark:border-sky-500/40 dark:text-sky-400' },
  { value: 'email_list',     label: 'Email a List',   icon: Mail,        color: 'bg-sky-100 border-sky-400 text-sky-800 dark:bg-sky-500/20 dark:border-sky-500/40 dark:text-sky-400' },
  { value: 'send_sms',       label: 'Send SMS',       icon: MessageSquare, color: 'bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-500/40 dark:text-emerald-400' },
  { value: 'generate_document', label: 'Generate Document', icon: FileText, color: 'bg-lime-100 border-lime-400 text-lime-800 dark:bg-lime-500/20 dark:border-lime-500/40 dark:text-lime-400' },
  { value: 'create_reminder', label: 'Create Reminder', icon: BellRing, color: 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-500/20 dark:border-amber-500/40 dark:text-amber-400' },
];

const stepTypeMap = Object.fromEntries(STEP_TYPES.map(t => [t.value, t]));

/**
 * The reference shown beside the config editor: what the engine accepts for
 * this step type, which keys it cannot act without, and how the step is
 * normally used. Sourced from `utils/workflowStepSchema.js`, which mirrors the
 * engine's own branches rather than restating them by hand.
 */
function StepConfigReference({ stepType, onInsertExample }) {
  const schema = STEP_SCHEMAS[stepType];
  if (!schema) return null;
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          What this step does
        </p>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">{schema.summary}</p>
      </div>

      {schema.fields.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Accepted keys
          </p>
          <dl className="mt-1 space-y-1">
            {schema.fields.map((f) => (
              <div key={f.key} className="text-xs">
                <dt className="inline font-mono text-gray-800 dark:text-gray-200">{f.key}</dt>
                {f.required && <span className="ml-1 text-[10px] font-semibold uppercase text-red-500">required</span>}
                <dd className="text-gray-500 dark:text-gray-400">{f.help ?? f.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Practice note
        </p>
        <p className="mt-0.5 text-xs leading-snug text-gray-600 dark:text-gray-300">{schema.standard}</p>
      </div>

      <button
        type="button"
        onClick={() => onInsertExample(schema.example)}
        className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        Insert a working example
      </button>
    </div>
  );
}

function StepCard({ step, index, selected, onSelect, onDelete, isLast }) {
  const type = stepTypeMap[step.step_type] || STEP_TYPES[2];
  const Icon = type.icon;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-72 border-2 rounded-xl p-4 cursor-pointer transition-all ${type.color} ${
          selected ? 'ring-2 ring-primary-500 shadow-lg' : 'hover:shadow-md'
        }`}
        onClick={() => onSelect(step)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">{type.label}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500">#{index + 1}</span>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete(step.id); }}
              className="p-1 rounded hover:bg-black/10 text-gray-500 hover:text-red-600 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-2">
          <p className="font-medium text-sm">{step.label || 'Unnamed Step'}</p>
          {step.description && (
            <p className="text-xs mt-0.5 opacity-75 line-clamp-2">{step.description}</p>
          )}
        </div>
      </div>
      {!isLast && (
        <div className="flex flex-col items-center my-1">
          <div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600" />
          <ArrowDown className="w-4 h-4 text-gray-400" />
          <div className="w-0.5 h-4 bg-gray-300 dark:bg-gray-600" />
        </div>
      )}
    </div>
  );
}

function StepConfigPanel({ step, workflowId: _workflowId, onSave, onClose }) {
  const [form, setForm] = useState({ ...step });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ ...step });
  }, [step]);

  // Validate as the author types. The previous editor parsed only on save and
  // swallowed a parse failure into `{}` — so a stray comma discarded the whole
  // config and saved an empty step that silently did nothing.
  const parsed = parseStepConfig(form.config);
  const checks = parsed.ok ? validateStepConfig(form.step_type, parsed.value) : { missing: [], warnings: [] };
  const blocked = !parsed.ok || checks.missing.length > 0;

  const handleSave = async () => {
    if (blocked) return;
    setSaving(true);
    try {
      await onSave({ ...form, config: parsed.value });
    } finally {
      setSaving(false);
    }
  };

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const insertExample = (example) => set('config', JSON.stringify(example, null, 2));

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b dark:border-white/[0.07] flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 dark:text-white/80">Configure Step</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Select
          label="Step Type"
          options={STEP_TYPES.map(t => ({ value: t.value, label: t.label }))}
          value={form.step_type || ''}
          onChange={e => set('step_type', e.target.value)}
        />
        <Input
          label="Step Label"
          value={form.label || ''}
          onChange={e => set('label', e.target.value)}
          placeholder="e.g., Notify Manager"
        />
        <TextArea
          label="Description"
          value={form.description || ''}
          onChange={e => set('description', e.target.value)}
          rows={2}
          placeholder="What does this step do?"
        />
        <div>
          <label htmlFor="step-config-json" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Configuration (JSON)</label>
          <textarea
            id="step-config-json"
            className="form-input font-mono text-xs"
            rows={8}
            value={typeof form.config === 'string' ? form.config : JSON.stringify(form.config || {}, null, 2)}
            onChange={e => set('config', e.target.value)}
            placeholder='{"key": "value"}'
          />
          {!parsed.ok ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              {parsed.error}
            </p>
          ) : checks.missing.length > 0 ? (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
              This step cannot act without: {checks.missing.join(', ')}.
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">Valid JSON. Step-specific configuration.</p>
          )}
          {checks.warnings.map((w) => (
            <p key={w} className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" />{w}
            </p>
          ))}

          <StepConfigReference stepType={form.step_type} onInsertExample={insertExample} />
        </div>
      </div>
      <div className="p-4 border-t dark:border-white/[0.07] flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">
          {blocked ? 'Fix the problems above to save' : ''}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving} disabled={blocked}>Save Step</Button>
        </div>
      </div>
    </div>
  );
}

export default function WorkflowBuilder({ workflowId, workflowData, onSave: _onSave }) {
  const [selectedStep, setSelectedStep] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStepType, setNewStepType] = useState('action');
  const [error, setError] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workflow-steps', workflowId],
    queryFn: () => builderService.getWorkflow(workflowId),
    select: (res) => res?.data ?? res,
    enabled: !!workflowId,
    initialData: workflowData,
  });

  const steps = (data?.steps || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const addStepMutation = useMutation({
    mutationFn: (stepData) => builderService.addWorkflowStep(workflowId, stepData),
    onSuccess: () => { refetch(); setShowAddModal(false); },
    onError: (e) => setError(e.message),
  });

  const updateStepMutation = useMutation({
    mutationFn: ({ id, ...data }) => builderService.updateWorkflowStep(id, data),
    onSuccess: () => { refetch(); setSelectedStep(null); },
    onError: (e) => setError(e.message),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (id) => builderService.deleteWorkflowStep(id),
    onSuccess: () => { refetch(); if (selectedStep?.id === undefined) setSelectedStep(null); },
    onError: (e) => setError(e.message),
  });

  const handleAddStep = () => {
    addStepMutation.mutate({
      step_type: newStepType,
      label: `New ${stepTypeMap[newStepType]?.label || 'Step'}`,
      order_index: steps.length + 1,
    });
  };

  // The editor has already parsed and validated `config`; it will not call
  // this with a bad one. Parsing again defensively (rather than assuming a
  // string) keeps the mutation correct if another caller appears.
  const handleSaveStep = async (form) => {
    const parsed = parseStepConfig(form.config);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    updateStepMutation.mutate({ id: form.id, ...form, config: parsed.value });
  };

  if (isLoading) return <div className="flex items-center justify-center p-12"><span className="text-gray-500">Loading workflow...</span></div>;

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="w-4/5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white/90">{data?.label || data?.name || 'Workflow Builder'}</h2>
            {data?.description && <p className="text-sm text-gray-500 dark:text-white/40">{data.description}</p>}
          </div>
          <Button onClick={() => setShowAddModal(true)} size="sm">
            <Plus className="w-4 h-4 shrink-0" />
            Add Step
          </Button>
        </div>

        {error && <Alert variant="error" dismissible onDismiss={() => setError(null)} className="mb-4">{error}</Alert>}

        {!steps.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <GitBranch className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No steps yet</p>
            <p className="text-sm mt-1">Add your first workflow step to get started.</p>
            <Button className="mt-4" onClick={() => setShowAddModal(true)} size="sm">
              <Plus className="w-4 h-4 shrink-0" />
              Add Step
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {steps.map((step, idx) => (
              <StepCard
                key={step.id}
                step={step}
                index={idx}
                selected={selectedStep?.id === step.id}
                onSelect={setSelectedStep}
                onDelete={(id) => deleteStepMutation.mutate(id)}
                isLast={idx === steps.length - 1}
              />
            ))}
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Step
            </button>
          </div>
        )}
      </div>

      {/* Config Panel */}
      {selectedStep && (
        <div className="w-80 border-l dark:border-white/[0.07] bg-white dark:bg-night-1 flex-shrink-0">
          <StepConfigPanel
            key={selectedStep.id}
            step={selectedStep}
            workflowId={workflowId}
            onSave={handleSaveStep}
            onClose={() => setSelectedStep(null)}
          />
        </div>
      )}

      {/* Add Step Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Workflow Step"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddStep} loading={addStepMutation.isPending}>Add Step</Button>
          </div>
        }
      >
        <Select
          label="Step Type"
          options={STEP_TYPES.map(t => ({ value: t.value, label: t.label }))}
          value={newStepType}
          onChange={e => setNewStepType(e.target.value)}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          {STEP_TYPES.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setNewStepType(t.value)}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  newStepType === t.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/20' : 'border-gray-200 dark:border-white/[0.07] hover:border-gray-300 dark:hover:border-white/[0.15]'
                }`}
              >
                <Icon className="w-5 h-5 mb-1" />
                <div className="text-sm font-medium">{t.label}</div>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
