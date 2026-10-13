import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { builderService } from '../../services/builder.service';
import Button from '../ui/Button';
import Input from '../ui/Input';
import TextArea from '../ui/TextArea';
import Select from '../ui/Select';
import Alert from '../ui/Alert';
import StepValidationEditor from './StepValidationEditor';
import { Plus, GripVertical, Trash2, ChevronRight } from 'lucide-react';

function SortableStepRow({ step, selected, onSelect, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
        selected ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.02] hover:border-gray-300'
      }`}
      onClick={() => onSelect(step)}
    >
      <button
        type="button"
        className="drag-handle p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="w-7 h-7 rounded-full bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {step.order_index}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-white/80 truncate">{step.label || 'Unnamed Step'}</p>
        {(step.form?.label || step.form?.name || step.description) && (
          <p className="text-xs text-gray-400 truncate">
            {step.form ? (step.form.label || step.form.name) : step.description}
          </p>
        )}
      </div>

      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />

      <button
        type="button"
        onClick={e => { e.stopPropagation(); onDelete(step.id); }}
        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function StepEditor({ step, formOptions, onSave, onClose }) {
  const [form, setForm] = useState({ ...step });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b dark:border-white/[0.07] flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 dark:text-white/80">Step Configuration</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Input
          label="Step Name"
          value={form.label || ''}
          onChange={e => set('label', e.target.value)}
          placeholder="e.g., Contact Info"
        />
        <TextArea
          label="Description"
          value={form.description || ''}
          onChange={e => set('description', e.target.value)}
          rows={2}
          placeholder="What does this step collect?"
        />
        <Select
          label="Linked Form"
          options={[
            { value: '', label: '— None —' },
            ...formOptions.map(f => ({ value: String(f.id), label: f.label || f.name })),
          ]}
          value={form.form_id ? String(form.form_id) : ''}
          onChange={v => set('form_id', v ? Number(v) : null)}
        />
        <div className="pt-2 border-t border-gray-100 dark:border-white/[0.07]">
          <StepValidationEditor
            value={form.config?.validation}
            formId={form.form_id}
            onChange={v => set('config', { ...(form.config || {}), validation: v })}
          />
        </div>
      </div>

      <div className="p-4 border-t dark:border-white/[0.07] flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Save</Button>
      </div>
    </div>
  );
}

export default function WizardBuilder({ wizardId, wizardData, onSave: _onSave }) {
  const [selectedStep, setSelectedStep] = useState(null);
  const [error, setError] = useState(null);
  const [addingStep, setAddingStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ['wizard-steps', wizardId],
    queryFn: () => builderService.getWizard(wizardId),
    enabled: !!wizardId,
  });

  // getWizard is wrapped: resolves to { data: wizard }; fall back to wizardData prop
  const data = rawData?.data || rawData || wizardData;

  const { data: formsData } = useQuery({
    queryKey: ['forms-list'],
    queryFn: () => builderService.getForms ? builderService.getForms() : Promise.resolve([]),
  });
  const formOptions = formsData?.data || [];

  const steps = (data?.steps || []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const addStepMutation = useMutation({
    mutationFn: (s) => builderService.addWizardStep(wizardId, s),
    onSuccess: () => { refetch(); setAddingStep(false); setNewStepName(''); },
    onError: (e) => setError(e.message),
  });

  const updateStepMutation = useMutation({
    mutationFn: ({ id, ...d }) => builderService.updateWizardStep(id, d),
    onSuccess: () => { refetch(); setSelectedStep(null); },
    onError: (e) => setError(e.message),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (id) => builderService.deleteWizardStep(id),
    onSuccess: () => { refetch(); setSelectedStep(null); },
    onError: (e) => setError(e.message),
  });

  const reorderMutation = useMutation({
    mutationFn: (reordered) => builderService.reorderWizardSteps(wizardId, reordered),
    onSuccess: () => refetch(),
  });

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex(s => s.id === active.id);
    const newIdx = steps.findIndex(s => s.id === over.id);
    const reordered = arrayMove(steps, oldIdx, newIdx).map((s, i) => ({ id: s.id, order_index: i + 1 }));
    reorderMutation.mutate(reordered);
  };

  const handleSaveStep = async (form) => {
    // Send only the columns the step owns; validation lives on config.validation.
    updateStepMutation.mutate({
      id:          form.id,
      name:        form.name,
      label:       form.label,
      description: form.description,
      form_id:     form.form_id ?? null,
      config:      form.config ?? {},
    });
  };

  if (isLoading) return <div className="flex items-center justify-center p-8 text-gray-500">Loading wizard...</div>;

  return (
    <div className="flex h-full">
      {/* Step list */}
      <div className="w-80 flex-shrink-0 border-r dark:border-white/[0.07] flex flex-col">
        <div className="p-4 border-b dark:border-white/[0.07] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white/90">{data?.label || data?.name || 'Wizard Builder'}</h2>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">{steps.length} step{steps.length !== 1 ? 's' : ''}</p>
          </div>
          <Button size="sm" onClick={() => setAddingStep(true)}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && <Alert variant="error" dismissible onDismiss={() => setError(null)}>{error}</Alert>}

          {!steps.length && !addingStep && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">No steps yet</p>
              <button
                type="button"
                className="text-primary-600 text-sm mt-2 hover:underline"
                onClick={() => setAddingStep(true)}
              >
                Add first step
              </button>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {steps.map(step => (
                <SortableStepRow
                  key={step.id}
                  step={step}
                  selected={selectedStep?.id === step.id}
                  onSelect={setSelectedStep}
                  onDelete={(id) => deleteStepMutation.mutate(id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {addingStep && (
            <div className="border-2 border-dashed border-primary-300 rounded-lg p-3 space-y-2">
              <Input
                placeholder="Step name..."
                value={newStepName}
                onChange={e => setNewStepName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newStepName.trim()) {
                    addStepMutation.mutate({ label: newStepName.trim(), name: newStepName.trim().toLowerCase().replace(/\s+/g, '_'), order_index: steps.length + 1 });
                  }
                  if (e.key === 'Escape') { setAddingStep(false); setNewStepName(''); }
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => newStepName.trim() && addStepMutation.mutate({ label: newStepName.trim(), name: newStepName.trim().toLowerCase().replace(/\s+/g, '_'), order_index: steps.length + 1 })}
                  loading={addStepMutation.isPending}
                  disabled={!newStepName.trim()}
                >
                  Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAddingStep(false); setNewStepName(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step editor / empty state */}
      <div className="flex-1 flex flex-col">
        {selectedStep ? (
          <StepEditor
            step={selectedStep}
            formOptions={formOptions}
            onSave={handleSaveStep}
            onClose={() => setSelectedStep(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-sm">Select a step to configure it</p>
          </div>
        )}
      </div>
    </div>
  );
}
