import { useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import FieldRenderer from './FieldRenderer';
import Spinner from '../ui/Spinner';
import Button from '../ui/Button';
import { buildValidationRules, computeFieldStates } from '../../utils/helpers';
import { computeField } from '../../utils/fieldFunctions';
import { useMetadataStore } from '../../store/metadataStore';
import { currencySource } from '../../utils/currencySource';

/**
 * FormRenderer — renders a complete form from metadata.
 *
 * Props:
 *   formMeta     — full form object from runtimeService.getForm()
 *                  { id, name, fields: [...], dependencies: [...] }
 *   defaultValues — pre-fill values (for edit mode)
 *   onSubmit      — async (data) => void called with form data on submit
 *   onCancel      — cancel button callback (optional)
 *   loading       — show submit spinner
 *   submitLabel   — button label (default "Save")
 *   readOnly      — show as read-only display
 *   serverErrors  — [{ field, message }] from the API's validation response; shown inline
 */
export default function FormRenderer({
  formMeta,
  defaultValues = {},
  onSubmit,
  onInvalid,
  onCancel,
  loading = false,
  submitLabel = 'Save',
  readOnly = false,
  recordId,
  serverErrors,
  lookupLabels,
}) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    watch,
    formState: { errors },
  } = useForm({ defaultValues });

  // Server-side validation failures land on the fields they name, exactly like
  // client-side ones, so the user sees the problem next to the input. The first
  // failing field is scrolled into view.
  useEffect(() => {
    if (!Array.isArray(serverErrors) || !serverErrors.length) return;
    for (const e of serverErrors) if (e?.field) setError(e.field, { type: 'server', message: e.message });
    const first = document.getElementById(serverErrors[0]?.field);
    first?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(serverErrors)]);

  // Re-populate form whenever defaultValues arrives (e.g. async edit data).
  // Coerce date/datetime values to the format HTML inputs expect.
  useEffect(() => {
    if (defaultValues && Object.keys(defaultValues).length > 0) {
      const coerced = { ...defaultValues };
      for (const f of (formMeta?.fields || [])) {
        const key = f.field_name ?? f.name;
        const val = coerced[key];
        if (val == null) continue;
        if (f.field_type === 'date' && typeof val === 'string' && val.includes('T')) {
          coerced[key] = val.slice(0, 10); // "2026-04-04T00:00:00.000Z" → "2026-04-04"
        } else if (f.field_type === 'datetime' && typeof val === 'string' && val.includes('T')) {
          coerced[key] = val.slice(0, 16); // → "2026-04-04T00:00"
        }
      }
      // A background refetch of the record must not wipe what the user has
      // already typed or ticked: keep dirty fields, refresh the rest.
      reset(coerced, { keepDirtyValues: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(defaultValues)]);

  const formValues = watch();

  // Compute field states (visible/disabled/required) from dependencies
  const fields = formMeta?.fields || [];
  const dependencies = formMeta?.dependencies || [];
  const fieldStates = computeFieldStates(dependencies, formValues, fields);

  // Use pre-compiled validation rules from MetadataStore when available
  const cachedValidation = useMetadataStore((s) => formMeta?.id ? s.getCompiledValidation(formMeta.id) : null);
  // The object's fields, to find where a money field's currency comes from (its own
  // currency field on the form, or the record linked through a lookup).
  const objectFields = useMetadataStore((s) => formMeta?.object_id ? s.getObject(formMeta.object_id)?.fields : null);
  const fieldNames = fields.map((f) => f.field_name ?? f.name);

  // Execute computed fields whenever relevant field values change
  useEffect(() => {
    const computedFields = fields.filter(f => f.config?.computed?.fn);
    if (!computedFields.length) return;

    const run = () => {
      for (const field of computedFields) {
        const { fn, trigger_fields = [] } = field.config.computed;

        // Only run if every trigger field has a value
        const hasValues = trigger_fields.every(tf => formValues[tf] !== undefined && formValues[tf] !== '');
        if (trigger_fields.length && !hasValues) continue;

        try {
          const result = computeField(fn, formValues);
          if (result !== undefined && result !== formValues[field.field_name]) {
            setValue(field.field_name, result, { shouldValidate: false, shouldDirty: true });
          }
        } catch {
          // silently ignore errors
        }
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(formValues)]);

  const handleFormSubmit = useCallback(async (data) => {
    if (onSubmit) await onSubmit(data);
  }, [onSubmit]);

  if (!formMeta) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    );
  }

  // Sort fields by position
  const sortedFields = [...fields].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // Group fields into sections by headings
  const sections = [];
  let currentSection = { heading: null, fields: [] };
  for (const field of sortedFields) {
    if (field.field_type === 'heading') {
      if (currentSection.fields.length || currentSection.heading) {
        sections.push(currentSection);
      }
      currentSection = { heading: field, fields: [] };
    } else {
      currentSection.fields.push(field);
    }
  }
  if (currentSection.fields.length || currentSection.heading) {
    sections.push(currentSection);
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit, onInvalid)} noValidate className="space-y-8">
      {sections.map((section, sIdx) => (
        <div key={sIdx} className="relative">
          {/* Section heading */}
          {section.heading && (
            <div className="mb-5">
              <div className="flex items-center gap-3">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-primary-500 to-mid" />
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-100 tracking-tight">
                  {section.heading.label}
                </h3>
                <div className="flex-1 h-px bg-gradient-to-r from-primary-200/60 to-transparent dark:from-primary-500/20" />
              </div>
              {section.heading.config?.description && (
                <p className="text-xs text-gray-500 mt-1 ml-4">{section.heading.config.description}</p>
              )}
            </div>
          )}

          {/* Fields grid */}
          <div className="grid grid-cols-12 gap-x-5 gap-y-4">
            {section.fields.map(field => {
              const state = fieldStates[field.field_name] || {};
              if (state.visible === false) return null;

              const colSpan = field.col_span || 6;
              const isAlwaysDisabled = field.config?.always_disabled === true;
              const fieldKey = field.field_name ?? field.name;
              const validationRules = readOnly ? {} : (
                cachedValidation?.[fieldKey] && (state.required ?? field.is_required) === field.is_required
                  ? cachedValidation[fieldKey]
                  : buildValidationRules({ ...field, is_required: state.required ?? field.is_required })
              );

              return (
                <div
                  key={field.id}
                  className={`col-span-${colSpan}`}
                  style={{ gridColumn: `span ${colSpan}` }}
                >
                  <FieldRenderer
                    field={field}
                    register={register}
                    control={control}
                    errors={errors}
                    validationRules={validationRules}
                    disabled={readOnly || isAlwaysDisabled || (state.disabled ?? false)}
                    required={state.required ?? field.is_required}
                    recordId={recordId}
                    knownLabels={lookupLabels?.[fieldKey] && defaultValues?.[fieldKey] != null
                      ? { [String(defaultValues[fieldKey])]: lookupLabels[fieldKey] } : undefined}
                    watchValue={field.config?.show_count ? formValues[fieldKey] : undefined}
                    currencySource={field.field_type === 'currency' ? currencySource(field.config?.currency_field, objectFields, fieldNames) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {!readOnly && (
        <div className="flex items-center justify-end gap-3 mt-8 pt-5 border-t border-gray-100 dark:border-white/10">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={loading} disabled={loading}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
