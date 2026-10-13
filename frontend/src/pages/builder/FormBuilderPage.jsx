import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { metadataService } from '../../services/metadata.service';
import { useBuilderStore } from '../../store/builderStore';
import FormBuilder from '../../components/builder/FormBuilder';
import BuilderGuide from '../../components/builder/BuilderGuide';
import Spinner from '../../components/ui/Spinner';
import Alert from '../../components/ui/Alert';

export default function FormBuilderPage() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setCurrentForm } = useBuilderStore();

  const isNew = !formId;

  // Toolbar state
  const [selectedModuleId, setSelectedModuleId] = useState(null);
  const [selectedObjectId, setSelectedObjectId] = useState(null);
  const [formType, setFormType] = useState('create');

  // ── Queries ──────────────────────────────────────────────
  const { data: modulesData } = useQuery({
    queryKey: ['modules'],
    queryFn: () => metadataService.getModules(),
  });
  const allModules = modulesData?.data || [];

  const { data: objectsData } = useQuery({
    queryKey: ['objects', selectedModuleId],
    queryFn: () => metadataService.getObjects(selectedModuleId),
    enabled: !!selectedModuleId,
  });
  const allObjects = objectsData?.data || [];

  const { data: formsData } = useQuery({
    queryKey: ['forms', selectedObjectId],
    queryFn: () => metadataService.getForms(selectedObjectId),
    enabled: !!selectedObjectId,
  });
  const allForms = formsData?.data || [];

  // Current form from URL param
  const { data, isLoading, error } = useQuery({
    queryKey: ['form-full', formId],
    queryFn: () => metadataService.getFormFull(formId),
    enabled: !isNew,
  });

  // Hydrate store + toolbar when form loads
  useEffect(() => {
    if (data?.data) {
      setCurrentForm(data.data);
      const form = data.data;
      if (form.object?.module_id) setSelectedModuleId(form.object.module_id);
      if (form.object_id)         setSelectedObjectId(form.object_id);
      if (form.form_type)         setFormType(form.form_type);
    }
  }, [data, setCurrentForm]);

  // Clear canvas when navigating to new form
  useEffect(() => {
    if (isNew) setCurrentForm(null);
  }, [isNew, setCurrentForm]);

  // ── Save mutation ────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ form, fields }) => {
      // 1. Create UiField records for new fields; persist config updates for existing ones
      const resolvedFields = await Promise.all(
        fields.map(async (f) => {
          if (f._isNew) {
            const created = await metadataService.createField({
              object_id:   selectedObjectId,
              name:        f.field?.name || `field_${Date.now()}`,
              label:       f.field?.label || 'Untitled',
              field_type:  f.field?.field_type || 'text',
              data_type:   f.field?.data_type  || 'string',
              is_required: f.field?.is_required || false,
              is_unique:   f.field?.is_unique   || false,
              placeholder: f.field?.placeholder || '',
              help_text:   f.field?.help_text   || '',
              default_value: f.field?.default_value ?? null,
              options:     f.field?.options ?? null,
              config:      f.field?.config ?? {},
              validations: f.field?.validations ?? [],
            });
            return { ...f, _isNew: false, field_id: created.data.id };
          }
          // Persist any config changes (computed fn, trigger fields, etc.) on existing fields
          await metadataService.updateField(f.field_id, {
            label:       f.field?.label,
            field_type:  f.field?.field_type,
            data_type:   f.field?.data_type,
            is_required: f.field?.is_required,
            is_unique:   f.field?.is_unique,
            placeholder: f.field?.placeholder,
            help_text:   f.field?.help_text,
            default_value: f.field?.default_value ?? null,
            options:     f.field?.options ?? undefined,
            config:      f.field?.config ?? {},
            // Full rule list every time: the API replaces the stored rules with it.
            validations: (f.field?.validations ?? []).map((v, i) => ({
              validation_type: v.validation_type, value: v.value ?? null, error_message: v.error_message ?? '', order_index: i,
            })),
          });
          return f;
        }),
      );

      // 2. Create or update the form record
      let savedFormId = form?.id;
      const formPayload = {
        object_id:   selectedObjectId,
        form_type:   formType,
        name:        form?.name  || `${formType}_form`,
        label:       form?.label || `${formType} form`,
        description: form?.description || '',
        is_active:   true,
      };
      if (!savedFormId) {
        const created = await metadataService.createForm(formPayload);
        savedFormId = created.data.id;
      } else {
        await metadataService.updateForm(savedFormId, formPayload);
      }

      // 3. Persist layout
      const layouts = resolvedFields
        .filter((f) => f.field_id)
        .map((f, idx) => ({
          field_id:    f.field_id,
          row:         idx,
          col:         0,
          col_span:    f.col_span ?? 1,
          order_index: idx,
          is_visible:  true,
        }));
      if (layouts.length) {
        await metadataService.saveFormLayout(savedFormId, layouts);
      }

      return savedFormId;
    },
    onSuccess: (savedId) => {
      qc.invalidateQueries({ queryKey: ['form-full', String(savedId)] });
      qc.invalidateQueries({ queryKey: ['forms', selectedObjectId] });
      if (isNew) {
        navigate(`/builder/form/${savedId}`, { replace: true });
      }
    },
  });

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!isNew && error) {
    return (
      <div className="p-6">
        <Alert variant="error">Failed to load form: {error.message}</Alert>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-5">
        <BuilderGuide section="/builder/form" />
      </div>
      <FormBuilder
        onSave={(payload) => saveMutation.mutate(payload)}
        saving={saveMutation.isPending}
        saveError={saveMutation.error?.message}
        modules={allModules}
        objects={allObjects}
        forms={allForms}
        selectedModuleId={selectedModuleId}
        selectedObjectId={selectedObjectId}
        formType={formType}
        onModuleChange={(id) => { setSelectedModuleId(id); setSelectedObjectId(null); }}
        onObjectChange={(id) => setSelectedObjectId(id)}
        onFormTypeChange={(t) => setFormType(t)}
        onSelectForm={(id) => {
          if (!id || id === 'new') navigate('/builder/form');
          else navigate(`/builder/form/${id}`);
        }}
      />
    </div>
  );
}
