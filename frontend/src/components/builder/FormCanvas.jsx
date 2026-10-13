import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import FieldCard from './FieldCard';
import { useBuilderStore } from '../../store/builderStore';

/**
 * FormCanvas — the central drag-and-drop canvas for the form builder.
 * Fields dropped here can be reordered, selected, and removed.
 */
export default function FormCanvas() {
  const { formFields, selectedFieldId, setSelectedField } = useBuilderStore();
  const { setNodeRef, isOver } = useDroppable({ id: 'form-canvas' });

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-night-0">
      {/* Canvas header */}
      <div className="px-6 py-3 bg-white dark:bg-night-1 border-b border-gray-200 dark:border-white/[0.07] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-white/80">Form Canvas</h3>
          <p className="text-xs text-gray-400 dark:text-white/30">{formFields.length} fields — drag to reorder</p>
        </div>
        <span className="text-xs text-gray-400 dark:text-white/30 bg-gray-100 dark:bg-white/[0.07] px-2 py-1 rounded-full">
          Click field to configure →
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={clsx(
          'flex-1 overflow-y-auto p-6',
          isOver && 'bg-primary-50/30',
        )}
      >
        {formFields.length === 0 ? (
          <EmptyCanvas isOver={isOver} />
        ) : (
          <SortableContext
            items={formFields.map((f) => f._tempId || f.field_id || f.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-3">
              {formFields.map((fieldLayout) => {
                const id = fieldLayout._tempId || fieldLayout.field_id || fieldLayout.id;
                return (
                  <div
                    key={id}
                    className={clsx(fieldLayout.col_span === 2 && 'col-span-2')}
                  >
                    <FieldCard
                      fieldLayout={fieldLayout}
                      isSelected={selectedFieldId === id}
                      onSelect={() => setSelectedField(id)}
                    />
                  </div>
                );
              })}
            </div>
          </SortableContext>
        )}
      </div>
    </div>
  );
}

function EmptyCanvas({ isOver }) {
  return (
    <div
      className={clsx(
        'h-full min-h-[400px] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200',
        isOver
          ? 'border-primary-400 bg-primary-50 text-primary-600'
          : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] text-gray-400 dark:text-white/30',
      )}
    >
      <Plus className="h-10 w-10 mb-3 opacity-50" />
      <p className="text-base font-medium mb-1">Drop fields here</p>
      <p className="text-sm opacity-70">Drag field types from the left panel</p>
    </div>
  );
}
