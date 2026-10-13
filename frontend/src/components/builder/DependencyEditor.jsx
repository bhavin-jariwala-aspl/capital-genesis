import { Plus, Trash2 } from 'lucide-react';
import { CONDITION_TYPES, ACTION_TYPES } from '../../utils/constants';
import Select from '../ui/Select';
import Input from '../ui/Input';
import Button from '../ui/Button';

/**
 * DependencyEditor — define inter-field dependencies.
 *
 * Props:
 *   dependencies   — existing dependencies involving this field
 *   allFields      — all fields on the form (for source/target selection)
 *   currentFieldId — the field being configured (will be the TARGET)
 *   onChange(deps)
 */
export default function DependencyEditor({ dependencies = [], allFields = [], currentFieldId, onChange }) {
  const addDep = () => {
    if (!allFields.length) return;
    const firstOther = allFields.find((f) => {
      const fId = f.field?.id || f.field_id;
      return fId !== currentFieldId;
    });
    if (!firstOther) return;
    onChange([
      ...dependencies,
      {
        source_field_id: firstOther.field?.id || firstOther.field_id,
        source_field: { id: firstOther.field?.id, name: firstOther.field?.name, label: firstOther.field?.label },
        target_field_id: currentFieldId,
        condition_type:  'equals',
        condition_value: '',
        action_type:     'show',
        action_value:    '',
      },
    ]);
  };

  const update = (index, updates) => {
    if (updates.source_field_id) {
      const sourceField = allFields.find((f) => (f.field?.id || f.field_id) === updates.source_field_id);
      updates.source_field = sourceField
        ? { id: sourceField.field?.id, name: sourceField.field?.name, label: sourceField.field?.label }
        : null;
    }
    onChange(dependencies.map((d, i) => i === index ? { ...d, ...updates } : d));
  };

  const remove = (index) => onChange(dependencies.filter((_, i) => i !== index));

  const condNeedsValue = (type) => !['is_empty', 'is_not_empty'].includes(type);

  return (
    <div className="space-y-2">
      {dependencies.map((dep, i) => (
        <div key={i} className="p-3 bg-gray-50 dark:bg-white/[0.04] rounded-lg border border-gray-200 dark:border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">When</span>
            <Select
              value={dep.source_field_id || ''}
              onChange={(e) => update(i, { source_field_id: Number(e.target.value) })}
              options={allFields
                .filter((f) => (f.field?.id || f.field_id) !== currentFieldId)
                .map((f) => ({ value: f.field?.id || f.field_id, label: f.field?.label || f.field?.name || 'Field' }))
              }
              placeholder="Select source field"
              className="text-xs"
              wrapperClass="flex-1"
            />
            <button onClick={() => remove(i)} className="p-1.5 text-gray-400 hover:text-red-500 shrink-0">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Select
              value={dep.condition_type}
              onChange={(e) => update(i, { condition_type: e.target.value })}
              options={CONDITION_TYPES}
              className="text-xs"
              wrapperClass="flex-1"
            />
            {condNeedsValue(dep.condition_type) && (
              <Input
                placeholder="Value"
                value={dep.condition_value || ''}
                onChange={(e) => update(i, { condition_value: e.target.value })}
                className="text-xs"
                wrapperClass="flex-1"
              />
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Then</span>
            <Select
              value={dep.action_type}
              onChange={(e) => update(i, { action_type: e.target.value })}
              options={ACTION_TYPES}
              className="text-xs"
              wrapperClass="flex-1"
            />
            {dep.action_type === 'set_value' && (
              <Input
                placeholder="Value to set"
                value={dep.action_value || ''}
                onChange={(e) => update(i, { action_value: e.target.value })}
                className="text-xs"
                wrapperClass="flex-1"
              />
            )}
          </div>
        </div>
      ))}

      <Button
        variant="ghost"
        size="sm"
        onClick={addDep}
        className="w-full border border-dashed border-gray-300 dark:border-gray-600"
        disabled={allFields.length < 2}
      >
        <Plus className="h-3.5 w-3.5" />
        Add Dependency Rule
      </Button>
      {allFields.length < 2 && (
        <p className="text-xs text-gray-400 text-center">Add more fields to the canvas first</p>
      )}
    </div>
  );
}
