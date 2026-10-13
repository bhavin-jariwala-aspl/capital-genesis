import { useState } from 'react';
import { Settings, Shield, GitBranch, Zap, Lock, Paintbrush } from 'lucide-react';
import clsx from 'clsx';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Checkbox from '../ui/Checkbox';
import TextArea from '../ui/TextArea';
import ValidationEditor from './ValidationEditor';
import DependencyEditor from './DependencyEditor';
import FunctionEditor from './FunctionEditor';
import FormulaEditor from './FormulaEditor';
import ObjectPicker from '../ui/ObjectPicker';
import { EntityPermissionPanel } from './PermissionPanel';
import { useBuilderStore } from '../../store/builderStore';
import { FIELD_TYPES } from '../../utils/constants';

const TABS = [
  { id: 'field',       label: 'Field',       icon: Settings },
  { id: 'appearance',  label: 'Look',        icon: Paintbrush },
  { id: 'validations', label: 'Validations', icon: Shield },
  { id: 'dependencies',label: 'Dependencies',icon: GitBranch },
  { id: 'functions',   label: 'Functions',   icon: Zap },
  { id: 'permissions', label: 'Access',      icon: Lock },
];

const NUMERIC_TYPES = ['number', 'currency', 'percentage', 'rating'];
const TEXT_TYPES    = ['text', 'email', 'phone', 'url', 'textarea', 'rich_text'];
const CHOICE_TYPES  = ['select', 'multi_select', 'radio', 'checkbox'];

/**
 * FieldConfigPanel — right panel of the Form Builder.
 * Shows configuration for the currently selected field.
 *
 * `field.config` carries the per-field appearance knobs read by FieldRenderer:
 *   label_position   top | left | hidden
 *   prefix / suffix  adornments inside the input ("$", "%", "kg")
 *   size             sm | md | lg
 *   rows             textarea height
 *   step / precision numeric step and decimals
 *   min / max        numeric input bounds (soft — validations enforce)
 *   show_count       character counter (text)
 *   choice_display   dropdown | chips | segmented (select/radio)
 *   description      longer explanatory text shown under the input
 *   allow_negative   currency may be negative
 *   allow_other      select accepts values outside the option list
 */
export default function FieldConfigPanel() {
  const { getSelectedField, updateFieldConfig, formFields } = useBuilderStore();
  const [activeTab, setActiveTab] = useState('field');

  const selected = getSelectedField();

  if (!selected) {
    return (
      <div className="w-72 shrink-0 bg-white dark:bg-night-1 border-l border-gray-200 dark:border-white/[0.07] flex items-center justify-center p-8">
        <div className="text-center text-gray-400 dark:text-white/30">
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Select a field to configure</p>
        </div>
      </div>
    );
  }

  const field = selected.field || {};
  const id = selected._tempId || selected.field_id || selected.id;
  const cfg = field.config || {};

  const update = (updates) => updateFieldConfig(id, updates);
  const setCfg = (patch) => {
    const next = { ...cfg };
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === undefined || v === null || v === false) delete next[k]; else next[k] = v;
    }
    update({ config: next });
  };

  const handleOptions = (raw) => {
    const opts = raw.split('\n')
      .filter(Boolean)
      .map((line) => {
        const [val, ...rest] = line.split(':');
        return { value: val.trim(), label: (rest.join(':') || val).trim() };
      });
    update({ options: opts });
  };

  const optionsText = (field.options || []).map((o) => (typeof o === 'string' ? `${o}: ${o}` : `${o.value}: ${o.label}`)).join('\n');
  const dependenciesAsTarget = (field.dependencies_as_target || []);
  const ft = field.field_type;

  return (
    <div className="w-72 shrink-0 bg-white dark:bg-night-1 border-l border-gray-200 dark:border-white/[0.07] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
        <p className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider truncate">
          {field.label || 'Field config'}
        </p>
        <p className="text-xs text-gray-400 dark:text-white/30 mt-0.5 capitalize">{ft}</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap bg-night-1 border-b border-white/[0.06] shrink-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'w-1/3 flex items-center justify-center gap-1 px-2 py-2.5 text-[11px] font-medium tracking-wide transition-all',
                activeTab === tab.id
                  ? 'text-white bg-white/[0.09] border-b-2 border-primary-400'
                  : 'text-white/80 hover:text-white hover:bg-white/[0.05] border-b-2 border-transparent',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {activeTab === 'field' && (
          <>
            <Input label="Label" value={field.label || ''} onChange={(e) => update({ label: e.target.value })} />
            <Input label="API Name" value={field.name || ''} onChange={(e) => update({ name: e.target.value })} help="snake_case identifier" />
            <Select
              label="Field Type"
              value={ft || 'text'}
              onChange={(e) => update({ field_type: e.target.value })}
              options={FIELD_TYPES.map((f) => ({ value: f.field_type, label: f.label }))}
            />
            <Input label="Placeholder" value={field.placeholder || ''} onChange={(e) => update({ placeholder: e.target.value })} />
            <TextArea label="Help Text" value={field.help_text || ''} onChange={(e) => update({ help_text: e.target.value })} rows={2} help="Short hint shown under the field" />
            <Input label="Default Value" value={field.default_value || ''} onChange={(e) => update({ default_value: e.target.value })} />
            <Checkbox label="Required" checked={!!field.is_required} onChange={(e) => update({ is_required: e.target.checked })} />
            <Checkbox label="Unique across records" checked={!!field.is_unique} onChange={(e) => update({ is_unique: e.target.checked })} />
            <Checkbox label="Read-only" checked={!!cfg.always_disabled} onChange={(e) => setCfg({ always_disabled: e.target.checked })} />

            {CHOICE_TYPES.includes(ft) && ft !== 'checkbox' && (
              <div>
                <label htmlFor="field-options" className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Options</label>
                <textarea
                  id="field-options"
                  className="form-input text-xs font-mono"
                  rows={5}
                  value={optionsText}
                  onChange={(e) => handleOptions(e.target.value)}
                  placeholder={'value: Label\nvalue2: Label 2'}
                />
                <p className="text-xs text-gray-400 mt-1">One per line: value: Label. Saved values must be one of these unless “Allow other” is on.</p>
                <Checkbox label="Allow values outside the list" checked={!!cfg.allow_other} onChange={(e) => setCfg({ allow_other: e.target.checked })} />
              </div>
            )}

            {ft === 'currency' && (
              <>
                <Select
                  label="Currency"
                  value={cfg.currency || 'USD'}
                  onChange={(e) => setCfg({ currency: e.target.value })}
                  options={['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD'].map((c) => ({ value: c, label: c }))}
                />
                <Checkbox label="Allow negative amounts" checked={!!cfg.allow_negative} onChange={(e) => setCfg({ allow_negative: e.target.checked })} />
              </>
            )}
            {ft === 'lookup' && (
              <ObjectPicker
                label="Points at"
                valueKey="name"
                value={cfg.target_object || ''}
                onChange={(name) => { setCfg({ target_object: name }); update({ data_type: 'number' }); }}
                help="Which object's records this field links to. Those records then list this one on their Related tab."
              />
            )}
            {ft === 'formula' && (
              <FormulaEditor cfg={cfg} setCfg={setCfg} dataType={field.data_type} onDataType={(dt) => update({ data_type: dt })} />
            )}
            {ft === 'rating' && (
              <Input label="Maximum rating" type="number" min={1} max={10} value={cfg.max ?? 5} onChange={(e) => setCfg({ max: Number(e.target.value) || 5 })} />
            )}
          </>
        )}

        {activeTab === 'appearance' && (
          <>
            <p className="text-[11px] leading-relaxed text-gray-500 dark:text-white/50">
              How this field looks wherever it is rendered. Width is set on the canvas; everything else lives here.
            </p>
            <Select
              label="Label position"
              value={cfg.label_position || 'top'}
              onChange={(e) => setCfg({ label_position: e.target.value === 'top' ? '' : e.target.value })}
              options={[{ value: 'top', label: 'Above the input' }, { value: 'left', label: 'Left of the input' }, { value: 'hidden', label: 'Hidden (placeholder only)' }]}
            />
            <Select
              label="Size"
              value={cfg.size || 'md'}
              onChange={(e) => setCfg({ size: e.target.value === 'md' ? '' : e.target.value })}
              options={[{ value: 'sm', label: 'Compact' }, { value: 'md', label: 'Default' }, { value: 'lg', label: 'Large' }]}
            />
            <TextArea label="Description" rows={2} value={cfg.description || ''} onChange={(e) => setCfg({ description: e.target.value })} help="Longer explanation shown under the input, below the help text" />

            {(TEXT_TYPES.includes(ft) || NUMERIC_TYPES.includes(ft)) && ft !== 'textarea' && ft !== 'rich_text' && (
              <div className="grid grid-cols-2 gap-2">
                <Input label="Prefix" placeholder="$" value={cfg.prefix || ''} onChange={(e) => setCfg({ prefix: e.target.value })} />
                <Input label="Suffix" placeholder="%" value={cfg.suffix || ''} onChange={(e) => setCfg({ suffix: e.target.value })} />
              </div>
            )}
            {TEXT_TYPES.includes(ft) && (
              <Checkbox label="Show character count" checked={!!cfg.show_count} onChange={(e) => setCfg({ show_count: e.target.checked })} />
            )}
            {(ft === 'textarea' || ft === 'rich_text') && (
              <Input label="Rows" type="number" min={2} max={20} value={cfg.rows ?? 4} onChange={(e) => setCfg({ rows: Number(e.target.value) || 4 })} />
            )}
            {NUMERIC_TYPES.includes(ft) && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Step" type="number" placeholder="1" value={cfg.step ?? ''} onChange={(e) => setCfg({ step: e.target.value })} />
                  <Input label="Decimals" type="number" min={0} max={6} placeholder="2" value={cfg.precision ?? ''} onChange={(e) => setCfg({ precision: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input label="Input min" type="number" value={cfg.min ?? ''} onChange={(e) => setCfg({ min: e.target.value })} help="Spinner bound" />
                  <Input label="Input max" type="number" value={cfg.max_input ?? ''} onChange={(e) => setCfg({ max_input: e.target.value })} />
                </div>
              </>
            )}
            {(ft === 'select' || ft === 'radio') && (
              <Select
                label="Choice display"
                value={cfg.choice_display || (ft === 'radio' ? 'radio' : 'dropdown')}
                onChange={(e) => setCfg({ choice_display: e.target.value })}
                options={[{ value: 'dropdown', label: 'Dropdown' }, { value: 'radio', label: 'Radio list' }, { value: 'chips', label: 'Chips' }, { value: 'segmented', label: 'Segmented control' }]}
              />
            )}
            {(ft === 'date' || ft === 'datetime') && (
              <div className="grid grid-cols-2 gap-2">
                <Input label="Earliest" type="date" value={cfg.min_date_input || ''} onChange={(e) => setCfg({ min_date_input: e.target.value })} />
                <Input label="Latest" type="date" value={cfg.max_date_input || ''} onChange={(e) => setCfg({ max_date_input: e.target.value })} />
              </div>
            )}
          </>
        )}

        {activeTab === 'validations' && (
          <ValidationEditor
            validations={field.validations || []}
            onChange={(v) => update({ validations: v })}
            allFields={formFields.filter((f) => (f._tempId || f.field_id || f.id) !== id)}
            fieldType={ft}
            fieldLabel={field.label}
          />
        )}

        {activeTab === 'dependencies' && (
          <DependencyEditor
            dependencies={dependenciesAsTarget}
            allFields={formFields}
            currentFieldId={field.id || id}
            onChange={(deps) => update({ dependencies_as_target: deps })}
          />
        )}

        {activeTab === 'functions' && (
          <FunctionEditor
            computed={cfg.computed || null}
            allFields={formFields}
            currentFieldId={field.id || id}
            onChange={(computed) => {
              const newConfig = { ...cfg };
              if (computed) newConfig.computed = computed;
              else delete newConfig.computed;
              update({ config: newConfig });
            }}
          />
        )}

        {activeTab === 'permissions' && (
          <EntityPermissionPanel entityType="field" entityId={field.id} />
        )}
      </div>
    </div>
  );
}
