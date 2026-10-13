import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, MouseSensor,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Save, Eye, Shield } from 'lucide-react';
import ComponentPalette from './ComponentPalette';
import FormCanvas       from './FormCanvas';
import FieldConfigPanel from './FieldConfigPanel';
import Button           from '../ui/Button';
import Modal            from '../ui/Modal';
import { EntityPermissionPanel } from './PermissionPanel';
import * as Icons       from 'lucide-react';
import { useBuilderStore } from '../../store/builderStore';
import { FIELD_TYPE_MAP } from '../../utils/constants';

/**
 * FormBuilder — the full drag-and-drop form editor.
 *
 * Layout: [ComponentPalette | FormCanvas | FieldConfigPanel]
 *
 * Props:
 *   onSave(formFields) → async function to persist the form layout
 *   loading
 */
export default function FormBuilder({
  onSave, saving, saveError, loading,
  modules = [], objects = [], forms = [],
  selectedModuleId, selectedObjectId, formType,
  onModuleChange, onObjectChange, onFormTypeChange, onSelectForm,
}) {
  const { formFields, addFieldToCanvas, reorderFields, currentForm } = useBuilderStore();
  const [activeItem, setActiveItem] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [permOpen, setPermOpen] = useState(false);

  const isBusy = saving || loading;

  // Form selector: existing forms for selected object + "New Form" option
  const formOptions = [
    { value: 'new', label: '+ New Form' },
    ...forms.map((f) => ({ value: String(f.id), label: `${f.label || f.name} (${f.form_type})` })),
  ];
  const currentFormValue = currentForm?.id ? String(currentForm.id) : 'new';

  const selectClass = 'text-sm border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 bg-white dark:bg-white/5 text-gray-700 dark:text-white/70 focus:outline-none focus:ring-2 focus:ring-primary-500';
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(MouseSensor,   { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = ({ active }) => {
    setActiveItem(active);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveItem(null);
    if (!over) return;

    const isFromPalette = active.data.current?.source === 'palette';
    const isFromCanvas  = active.data.current?.source === 'canvas';

    if (isFromPalette && (over.id === 'form-canvas' || over.data.current?.source === 'canvas')) {
      // Drop from palette onto canvas or onto an existing field — add new field
      addFieldToCanvas(active.data.current.fieldType);
      return;
    }

    if (isFromCanvas) {
      // Reorder within canvas
      const oldIndex = formFields.findIndex((f) => {
        const fId = f._tempId || f.field_id || f.id;
        return String(fId) === String(active.id);
      });
      const newIndex = formFields.findIndex((f) => {
        const fId = f._tempId || f.field_id || f.id;
        return String(fId) === String(over.id);
      });
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        reorderFields(arrayMove(formFields, oldIndex, newIndex));
      }
    }
  };

  const handleDragOver = ({ active, over }) => {
    if (active.data.current?.source === 'palette' && (over?.id === 'form-canvas' || over?.data.current?.source === 'canvas')) {
      // Visual cue only — actual add happens on dragEnd
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Builder Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-night-1 border-b border-gray-200 dark:border-white/[0.07] shrink-0 gap-3 flex-wrap">
        {/* Left: selectors */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-white/80 shrink-0">Form Builder</h2>

          {/* Module selector */}
          <select
            value={selectedModuleId ?? ''}
            onChange={(e) => onModuleChange?.(e.target.value ? Number(e.target.value) : null)}
            className={selectClass + ' min-w-[130px]'}
          >
            <option value="">— Module —</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>{m.label || m.name}</option>
            ))}
          </select>

          {/* Object selector */}
          <select
            value={selectedObjectId ?? ''}
            onChange={(e) => onObjectChange?.(e.target.value ? Number(e.target.value) : null)}
            className={selectClass + ' min-w-[130px]'}
            disabled={!selectedModuleId}
          >
            <option value="">— Object —</option>
            {objects.map((o) => (
              <option key={o.id} value={o.id}>{o.label || o.name}</option>
            ))}
          </select>

          {/* Form type selector */}
          <select
            value={formType || 'create'}
            onChange={(e) => onFormTypeChange?.(e.target.value)}
            className={selectClass}
            disabled={!selectedObjectId}
          >
            <option value="create">create</option>
            <option value="edit">edit</option>
            <option value="view">view</option>
            <option value="search">search</option>
            <option value="modal">modal</option>
          </select>

          {/* Existing forms selector */}
          {selectedObjectId && (
            <select
              value={currentFormValue}
              onChange={(e) => onSelectForm?.(e.target.value)}
              className={selectClass + ' min-w-[160px]'}
            >
              {formOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}

          <span className="text-xs text-gray-400 dark:text-white/30 bg-gray-100 dark:bg-white/[0.07] px-2 py-0.5 rounded-full shrink-0">
            {formFields.length} field{formFields.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {currentForm?.id && (
            <Button variant="ghost" size="sm" onClick={() => setPermOpen(true)} title="Manage form permissions">
              <Shield className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setPreviewMode((p) => !p)}>
            <Eye className="h-4 w-4" />
            {previewMode ? 'Edit' : 'Preview'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isBusy}
            disabled={!selectedObjectId}
            onClick={() => onSave?.({ form: currentForm, fields: formFields })}
          >
            <Save className="h-4 w-4" />
            Save Form
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-200 text-sm text-red-600">
          Save failed: {saveError}
        </div>
      )}

      {!selectedObjectId && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-700">
          Select a <strong>Module</strong> and <strong>Object</strong> above to start building the form.
        </div>
      )}

      {/* Builder body */}
      <div className="flex flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
        >
          {!previewMode && <ComponentPalette />}
          <FormCanvas previewMode={previewMode} />
          {!previewMode && <FieldConfigPanel />}

          {/* Drag overlay — shows what's being dragged */}
          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <DragPreview activeItem={activeItem} />
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Form-level permissions modal */}
      <Modal
        isOpen={permOpen}
        onClose={() => setPermOpen(false)}
        title={`Permissions — ${currentForm?.label || currentForm?.name || 'Form'}`}
        size="md"
      >
        {currentForm?.id && (
          <EntityPermissionPanel entityType="form" entityId={currentForm.id} />
        )}
      </Modal>
    </div>
  );
}

function DragPreview({ activeItem }) {
  const isFromPalette = activeItem.data.current?.source === 'palette';

  if (isFromPalette) {
    const ft = activeItem.data.current.fieldType;
    const Icon = Icons[ft.icon] || Icons.Square;
    return (
          <div className="flex items-center gap-2 bg-white dark:bg-night-2 border-2 border-primary-400 rounded-lg px-3 py-2 shadow-elevated text-sm font-medium text-gray-700 dark:text-white/70">
        <Icon className="h-4 w-4 text-primary-500" />
        {ft.label}
      </div>
    );
  }

  const fl = activeItem.data.current?.fieldLayout;
  const field = fl?.field || {};
  const Icon = Icons[FIELD_TYPE_MAP[field.field_type]?.icon] || Icons.Square;
  return (
      <div className="flex items-center gap-2 bg-white dark:bg-night-2 border-2 border-primary-400 rounded-lg px-3 py-2 shadow-elevated text-sm font-medium text-gray-700 dark:text-white/70 opacity-90 w-64">
      <Icon className="h-4 w-4 text-primary-500" />
      {field.label || 'Field'}
    </div>
  );
}
