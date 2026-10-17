import { Controller, useWatch } from 'react-hook-form';
import clsx from 'clsx';
import Input from '../ui/Input';
import Select from '../ui/Select';
import TextArea from '../ui/TextArea';
import CurrencyInput from '../ui/CurrencyInput';
import Checkbox from '../ui/Checkbox';
import RadioGroup from '../ui/RadioGroup';
import StatusTracker from '../ui/StatusTracker';
import RecordPicker from '../ui/RecordPicker';
import { useQuery } from '@tanstack/react-query';
import { runtimeService } from '../../services/metadata.service';
import { isoCode } from '../../utils/currencySource';

/**
 * A money input denominated in the record's own currency when the field names
 * one with `config.currency_field` (a USD fund order's amount follows its
 * `currency_code`). Until that code is known — e.g. a new order whose currency
 * comes from the share class picked — no symbol is shown rather than the
 * tenant's, which would be wrong.
 *
 * `source` (from `currencySource`) says where the code is read: the form's own
 * field, or — when the record's currency field is copied from a linked record
 * (an AUM snapshot's `base_currency` from its mandate) — the record picked in
 * that lookup.
 */
function RecordCurrencyInput({ control, currencyField, source, ...props }) {
  const src = source || (currencyField ? { field: currencyField } : null);
  const own = useWatch({ control, name: src?.field || '__no_currency_field__' });
  const linkedId = useWatch({ control, name: src?.lookup || '__no_currency_lookup__' });
  const { data: linked } = useQuery({
    queryKey: ['runtime-record', String(linkedId)],
    queryFn: () => runtimeService.getRecord(linkedId),
    enabled: !!src?.lookup && !isoCode(own) && linkedId != null && linkedId !== '',
    staleTime: 60_000,
  });
  const known = src ? (isoCode(own) ?? (src.lookup ? isoCode(linked?.data?.data?.[src.target]) : undefined)) : undefined;
  return <CurrencyInput {...props} currency={known} hideSymbol={!!src && !known} />;
}

/**
 * FieldRenderer — renders a single field based on its field_type.
 * Integrates with react-hook-form via register/control/errors.
 *
 * Appearance is driven by `field.config` (set in the Form Builder → Look tab):
 *   label_position top|left|hidden · size sm|md|lg · prefix / suffix · rows ·
 *   step / precision / min / max_input · show_count · choice_display ·
 *   description · min_date_input / max_date_input
 *
 * Props:
 *   field         — UiField metadata object
 *   register      — react-hook-form register
 *   control       — react-hook-form control (for Controller-based fields)
 *   errors        — react-hook-form errors
 *   validationRules — compiled rules from buildValidationRules(field)
 *   disabled      — override disabled state
 *   required      — override required state
 *   watchValue    — current value (for the character counter)
 *   currencySource — where a money field reads its currency code (see utils/currencySource)
 */
export default function FieldRenderer({
  field,
  register,
  control,
  errors,
  validationRules = {},
  disabled = false,
  required = false,
  recordId,
  watchValue,
  knownLabels,
  currencySource,
}) {
  const fieldName = field.field_name ?? field.name;  // normaliseFormMeta sets field_name; defensive fallback
  const error = errors?.[fieldName]?.message;
  const isRequired = required || field.is_required;
  const cfg = field.config || {};
  const labelPos = cfg.label_position || 'top';
  const label = labelPos === 'hidden' ? undefined : field.label + (isRequired ? ' *' : '');
  const sizeClass = cfg.size === 'sm' ? 'py-1.5 text-xs' : cfg.size === 'lg' ? 'py-3 text-base' : undefined;
  const help = [field.help_text, cfg.description].filter(Boolean).join(' — ') || undefined;
  const count = cfg.show_count && typeof watchValue === 'string' ? watchValue.length : null;

  const commonProps = {
    label,
    error,
    disabled,
    id: fieldName,
    help: count != null ? `${help ? `${help} · ` : ''}${count} characters` : help,
    className: sizeClass,
    prefix: cfg.prefix || undefined,
    suffix: cfg.suffix || undefined,
    'aria-label': labelPos === 'hidden' ? field.label : undefined,
    title: labelPos === 'hidden' ? field.label : undefined,
  };

  const ft = field.field_type;

  // Short-circuit: render-only fields
  if (ft === 'heading') {
    return (
      <div className="col-span-full">
        <div className="flex items-center gap-3">
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-primary-500 to-mid" />
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 tracking-tight">
            {field.label}
          </h3>
          <div className="flex-1 h-px bg-gradient-to-r from-primary-200/60 to-transparent dark:from-primary-500/20" />
        </div>
        {cfg.description && <p className="text-xs text-gray-500 mt-1 ml-4">{cfg.description}</p>}
      </div>
    );
  }

  if (ft === 'divider') {
    return (
      <div className="col-span-full py-1">
        <div className="h-px bg-gradient-to-r from-gray-200 via-gray-300/60 to-transparent dark:from-white/10 dark:via-white/5" />
      </div>
    );
  }

  // Display-only timeline tracker (Amazon/UPS-style). Reads the record's status
  // events; milestone stages come from field.config.stages.
  if (ft === 'status_tracker') {
    return <StatusTracker recordId={recordId} config={cfg} label={field.label} />;
  }

  const body = renderControl();
  // Left-aligned label: wrap the control in a two-column row and let the
  // control hide its own label.
  if (labelPos === 'left' && label) {
    return (
      <div className="grid grid-cols-[minmax(7rem,1fr)_2fr] items-start gap-3">
        <label htmlFor={fieldName} className="text-sm font-medium text-gray-700 dark:text-gray-300 pt-2.5">{label}</label>
        <div>{body}</div>
      </div>
    );
  }
  return body;

  function renderControl() {
    const ctl = labelPos === 'left' ? { ...commonProps, label: undefined } : commonProps;
    const options = (field.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

    if (ft === 'rich_text' || ft === 'textarea') {
      return (
        <TextArea
          {...ctl}
          rows={Number(cfg.rows) || (ft === 'rich_text' ? 5 : 4)}
          placeholder={field.placeholder}
          {...register(fieldName, validationRules)}
        />
      );
    }

    // Lookup — a searchable picker over the target object's records. Without a
    // target (legacy rows) it falls back to the static option list below.
    if (ft === 'lookup' && cfg.target_object) {
      return (
        <Controller
          name={fieldName}
          control={control}
          rules={validationRules}
          render={({ field: f }) => (
            <RecordPicker id={fieldName} targetObject={cfg.target_object} value={f.value ?? null} onChange={f.onChange}
              knownLabels={knownLabels} label={ctl.label} error={error} help={commonProps.help} disabled={disabled} placeholder={field.placeholder} />
          )}
        />
      );
    }

    // Select-type fields — dropdown by default, or chips / segmented / radio list.
    if (ft === 'select' || ft === 'lookup' || (ft === 'radio' && ['dropdown', 'chips', 'segmented'].includes(cfg.choice_display))) {
      const display = cfg.choice_display || 'dropdown';
      if (display === 'chips' || display === 'segmented') {
        return (
          <Controller
            name={fieldName}
            control={control}
            rules={validationRules}
            render={({ field: f }) => (
              <ChoiceButtons {...ctl} options={options} value={f.value ?? ''} onChange={f.onChange} segmented={display === 'segmented'} />
            )}
          />
        );
      }
      return (
        <Controller
          name={fieldName}
          control={control}
          rules={validationRules}
          render={({ field: f }) => (
            <Select
              {...ctl}
              options={options}
              value={f.value ?? ''}
              onChange={f.onChange}
              placeholder={field.placeholder || 'Select...'}
            />
          )}
        />
      );
    }

    if (ft === 'multi_select') {
      return (
        <div>
          {ctl.label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{ctl.label}</label>}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          <Controller
            name={fieldName}
            control={control}
            rules={validationRules}
            render={({ field: f }) => (
              <div className={clsx('border dark:border-white/10 rounded-lg p-2', cfg.choice_display === 'chips' ? 'flex flex-wrap gap-1.5' : 'space-y-1')}>
                {options.map((opt) => {
                  const checked = (f.value || []).includes(opt.value);
                  const toggle = () => f.onChange(checked ? (f.value || []).filter((v) => v !== opt.value) : [...(f.value || []), opt.value]);
                  if (cfg.choice_display === 'chips') {
                    return (
                      <button key={opt.value} type="button" disabled={disabled} onClick={toggle}
                        className={clsx('px-2.5 py-1 rounded-full text-xs border transition-colors',
                          checked ? 'bg-primary-600 text-on-primary border-primary-600' : 'border-gray-200 text-gray-600 hover:border-primary-300 dark:border-white/10 dark:text-gray-300')}>
                        {opt.label}
                      </button>
                    );
                  }
                  return (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" value={opt.value} checked={checked} onChange={toggle} disabled={disabled}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          />
          {help && <p className="form-help mt-1">{help}</p>}
        </div>
      );
    }

    if (ft === 'radio') {
      return (
        <Controller
          name={fieldName}
          control={control}
          rules={validationRules}
          render={({ field: f }) => (
            <RadioGroup label={ctl.label} options={options} value={f.value ?? ''} onChange={f.onChange} disabled={disabled} error={error} />
          )}
        />
      );
    }

    if (ft === 'checkbox') {
      return (
        <Controller
          name={fieldName}
          control={control}
          rules={validationRules}
          render={({ field: f }) => (
            <Checkbox id={fieldName} label={ctl.label ?? field.label} checked={!!f.value} onChange={(e) => f.onChange(e.target.checked)} disabled={disabled} error={error} />
          )}
        />
      );
    }

    if (ft === 'currency') {
      return (
        <Controller
          name={fieldName}
          control={control}
          rules={validationRules}
          render={({ field: f }) => (
            <RecordCurrencyInput control={control} currencyField={cfg.currency_field} source={currencySource} id={fieldName} label={ctl.label} value={f.value ?? ''} onChange={f.onChange} disabled={disabled} error={error} placeholder={field.placeholder} help={help} />
          )}
        />
      );
    }

    if (ft === 'number' || ft === 'integer' || ft === 'decimal' || ft === 'percent' || ft === 'percentage' || ft === 'rating') {
      const precision = cfg.precision !== undefined && cfg.precision !== '' ? Number(cfg.precision) : null;
      const step = cfg.step || (ft === 'integer' || precision === 0 ? '1' : precision ? String(10 ** -precision) : (ft === 'rating' ? '1' : '0.01'));
      return (
        <Input
          {...ctl}
          type="number"
          step={step}
          min={cfg.min !== undefined && cfg.min !== '' ? cfg.min : (ft === 'rating' ? 0 : undefined)}
          max={cfg.max_input !== undefined && cfg.max_input !== '' ? cfg.max_input : (ft === 'rating' ? (cfg.max ?? 5) : undefined)}
          suffix={ctl.suffix ?? (ft === 'percentage' || ft === 'percent' ? '%' : undefined)}
          placeholder={field.placeholder}
          {...register(fieldName, validationRules)}
        />
      );
    }

    if (ft === 'date' || ft === 'datetime' || ft === 'time') {
      const type = ft === 'date' ? 'date' : ft === 'datetime' ? 'datetime-local' : 'time';
      return (
        <Input
          {...ctl}
          type={type}
          min={cfg.min_date_input || undefined}
          max={cfg.max_date_input || undefined}
          {...register(fieldName, validationRules)}
        />
      );
    }

    if (ft === 'date_range') {
      return (
        <div>
          {ctl.label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{ctl.label}</label>}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          <div className="flex gap-2">
            <Input label="From" type="date" disabled={disabled} {...register(`${fieldName}_from`, validationRules)} />
            <Input label="To" type="date" disabled={disabled} {...register(`${fieldName}_to`, {})} />
          </div>
        </div>
      );
    }

    if (ft === 'email') {
      return <Input {...ctl} type="email" placeholder={field.placeholder || 'email@example.com'} {...register(fieldName, validationRules)} />;
    }
    if (ft === 'phone') {
      return <Input {...ctl} type="tel" placeholder={field.placeholder || 'Phone number'} {...register(fieldName, validationRules)} />;
    }
    if (ft === 'url') {
      return <Input {...ctl} type="url" placeholder={field.placeholder || 'https://'} {...register(fieldName, validationRules)} />;
    }

    if (ft === 'color') {
      return (
        <div>
          {ctl.label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{ctl.label}</label>}
          <input type="color" disabled={disabled} className="h-10 w-full rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-1" {...register(fieldName, validationRules)} />
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      );
    }

    if (ft === 'hidden') {
      return <input type="hidden" {...register(fieldName, validationRules)} />;
    }

    if (ft === 'file' || ft === 'image') {
      return (
        <div>
          {ctl.label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{ctl.label}</label>}
          <input
            type="file"
            accept={ft === 'image' ? 'image/*' : cfg.accept || undefined}
            disabled={disabled}
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 dark:file:bg-primary-500/20 dark:file:text-primary-400"
            {...register(fieldName, validationRules)}
          />
          {help && <p className="form-help mt-1">{help}</p>}
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      );
    }

    // Auto-calculated / auto-number / formula — read-only display. Formulas
    // are evaluated by the server on save, so a new record shows a hint.
    if (ft === 'auto_calculate' || ft === 'auto_number' || ft === 'formula') {
      return <Input {...ctl} type="text" readOnly disabled placeholder={ft === 'auto_number' ? 'Assigned on save' : 'Calculated on save'} {...register(fieldName, {})} />;
    }

    // Default — text input
    return (
      <Input
        {...ctl}
        type="text"
        placeholder={field.placeholder}
        maxLength={cfg.max_length_input || undefined}
        {...register(fieldName, validationRules)}
      />
    );
  }
}

/** Single-choice rendered as chips or a segmented control. */
function ChoiceButtons({ label, options, value, onChange, segmented, disabled, error, help, id }) {
  return (
    <div className="flex flex-col gap-1.5" id={id}>
      {label && <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</label>}
      <div className={clsx(segmented ? 'inline-flex rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden' : 'flex flex-wrap gap-1.5')}>
        {options.map((opt) => {
          const active = String(value) === String(opt.value);
          return (
            <button key={opt.value} type="button" disabled={disabled} onClick={() => onChange(active && !segmented ? '' : opt.value)}
              className={clsx(
                'text-sm transition-colors',
                segmented ? 'px-3 py-2 border-r last:border-r-0 border-gray-200 dark:border-white/10' : 'px-3 py-1.5 rounded-full border',
                active
                  ? 'bg-primary-600 text-on-primary border-primary-600'
                  : 'bg-white/70 text-gray-700 hover:bg-primary-50 dark:bg-white/5 dark:text-gray-300 border-gray-200 dark:border-white/10',
              )}>
              {opt.label}
            </button>
          );
        })}
      </div>
      {help && <p className="form-help">{help}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
