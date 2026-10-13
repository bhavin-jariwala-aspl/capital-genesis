import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { GripVertical, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useBuilderStore } from '../../store/builderStore';
import { FIELD_TYPE_MAP } from '../../utils/constants';

/**
 * FieldCard — represents a single field on the FormCanvas.
 * Shows field type icon, label, and edit controls.
 */
export default function FieldCard({ fieldLayout, isSelected, onSelect }) {
  const { removeFieldFromCanvas, reorderFields, formFields } = useBuilderStore();

  const id = fieldLayout._tempId || fieldLayout.field_id || fieldLayout.id;
  const field = fieldLayout.field || {};
  const fieldTypeMeta = FIELD_TYPE_MAP[field.field_type] || {};
  const Icon = Icons[fieldTypeMeta.icon] || Icons.Square;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { source: 'canvas', fieldLayout },
  });

  const toggleColSpan = () => {
    const newFields = formFields.map((f) => {
      const fId = f._tempId || f.field_id || f.id;
      if (fId !== id) return f;
      return { ...f, col_span: f.col_span === 2 ? 1 : 2 };
    });
    reorderFields(newFields);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
      className={clsx(
        'group relative rounded-xl border-2 bg-white dark:bg-night-2 p-3 cursor-pointer transition-all duration-150',
        'hover:border-primary-300 hover:shadow-card-md',
        isSelected ? 'border-primary-500 shadow-card-md ring-1 ring-primary-400' : 'border-gray-200 dark:border-white/[0.07]',
        isDragging && 'opacity-40 shadow-elevated',
      )}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          className="drag-handle text-gray-300 hover:text-gray-500 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </span>

        {/* Field type icon */}
        <span className="h-7 w-7 rounded-lg bg-primary-50 dark:bg-primary-500/20 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary-500" />
        </span>

        {/* Label + type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-white/80 truncate">
            {field.label || fieldTypeMeta.label || 'Untitled Field'}
          </p>
          <p className="text-xs text-gray-400 dark:text-white/30 truncate">
            {fieldTypeMeta.label} {field.is_required && '· Required'}
          </p>
        </div>

        {/* Controls — visible on hover / selected */}
        <div
          className={clsx(
            'flex items-center gap-1 transition-opacity duration-150',
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            title={fieldLayout.col_span === 2 ? 'Half width' : 'Full width'}
            onClick={toggleColSpan}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-600 dark:hover:text-white/70"
          >
            {fieldLayout.col_span === 2
              ? <ChevronLeft className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          <button
            title="Remove field"
            onClick={() => removeFieldFromCanvas(id)}
            className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Field preview */}
      <FieldPreview field={field} />
    </div>
  );
}

function FieldPreview({ field }) {
  const previewClass = 'mt-2 h-7 w-full rounded-md bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] text-xs text-gray-400 dark:text-white/30 flex items-center px-3 pointer-events-none';

  if (['text', 'email', 'phone', 'url', 'number', 'currency', 'percentage'].includes(field.field_type)) {
    return <div className={previewClass}>{field.placeholder || field.label || '…'}</div>;
  }
  if (field.field_type === 'textarea') {
    return <div className="mt-2 h-12 w-full rounded-md bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] text-xs text-gray-400 dark:text-white/30 flex items-start px-3 pt-2 pointer-events-none">{field.placeholder || field.label || '…'}</div>;
  }
  if (field.field_type === 'select') {
    return (
      <div className={previewClass + ' justify-between'}>
        <span>{field.placeholder || 'Select…'}</span>
        <Icons.ChevronDown className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (field.field_type === 'date' || field.field_type === 'datetime') {
    return (
      <div className={previewClass + ' justify-between'}>
        <span>mm/dd/yyyy</span>
        <Icons.Calendar className="h-3.5 w-3.5" />
      </div>
    );
  }
  if (field.field_type === 'checkbox') {
    return (
      <div className="mt-2 flex items-center gap-2 pointer-events-none">
        <div className="h-4 w-4 rounded border border-gray-300 dark:border-white/[0.15] bg-gray-50 dark:bg-white/[0.04]" />
        <span className="text-xs text-gray-400">{field.label}</span>
      </div>
    );
  }
  if (field.field_type === 'rating') {
    return (
      <div className="mt-2 flex items-center gap-1 pointer-events-none">
        {[1,2,3,4,5].map((s) => (
          <Icons.Star key={s} className="h-4 w-4 text-gray-200" />
        ))}
      </div>
    );
  }
  return null;
}

