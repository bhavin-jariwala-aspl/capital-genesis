import clsx from 'clsx';
import { useDraggable } from '@dnd-kit/core';
import { FIELD_TYPE_GROUPS } from '../../utils/constants';
import * as Icons from 'lucide-react';

/**
 * ComponentPalette — left sidebar of the Form Builder.
 * Shows all available field types grouped by category.
 * Each type is a draggable item.
 */
export default function ComponentPalette() {
  return (
    <div className="w-56 shrink-0 bg-white dark:bg-night-1 border-r border-gray-200 dark:border-white/[0.07] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider">Field Types</h3>
        <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5">Drag onto canvas</p>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(FIELD_TYPE_GROUPS).map(([group, types]) => (
          <div key={group} className="mb-2">
            <p className="px-4 py-1 text-[10px] font-semibold text-gray-400 dark:text-white/30 uppercase tracking-widest">
              {group}
            </p>
            {types.map((ft) => (
              <DraggableFieldType key={ft.field_type} fieldType={ft} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DraggableFieldType({ fieldType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   `palette::${fieldType.field_type}`,
    data: { source: 'palette', fieldType },
  });

  const Icon = Icons[fieldType.icon] || Icons.Square;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={clsx(
        'mx-2 px-3 py-2 rounded-lg flex items-center gap-2.5 cursor-grab active:cursor-grabbing',
        'text-sm text-gray-700 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors select-none',
        isDragging && 'opacity-50',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-white/30" />
      <span>{fieldType.label}</span>
    </div>
  );
}
